import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { getStripe, PLANS } from "@/lib/stripe";
import { incrementProjectCredits } from "@/lib/project-credits";

/**
 * POST /api/stripe/verify-subscription
 *
 * Called after Stripe checkout redirect to verify the subscription was created.
 * This handles the race condition where the webhook hasn't processed yet —
 * instead of polling the DB, we check Stripe directly and update if needed.
 */
export async function POST(request: Request) {
  try {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId } = await request.json();
    const db = getDb();

    const projects = await db`SELECT * FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
    if (projects.length === 0) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const project = projects[0];

    // Already active — still check if credits were added (checkout.session.completed
    // sets status to 'active' but credits are added by invoice.paid which may be delayed).
    // We check for a processed invoice.paid OR a verify-credits event rather than credit amounts,
    // since the user may already have credits from a one-time pack purchase.
    if (project.subscription_status === "active") {
      const creditsAlreadyAdded = await db`
        SELECT id FROM stripe_webhook_events
        WHERE project_id = ${projectId}
          AND type IN ('invoice.paid', 'verify_credits_added')
          AND processed = TRUE
        LIMIT 1
      `;
      if (creditsAlreadyAdded.length === 0) {
        // Neither invoice.paid nor a previous verify call has added credits yet.
        // Insert a synthetic event as an idempotency guard to prevent double-crediting
        // (this endpoint can be called multiple times from the polling loop).
        const syntheticId = `verify_credits_${projectId}_${Date.now()}`;
        const inserted = await db`
          INSERT INTO stripe_webhook_events (stripe_event_id, type, livemode, processed, project_id, user_id)
          VALUES (${syntheticId}, 'verify_credits_added', FALSE, TRUE, ${projectId}, ${user.id})
          ON CONFLICT (stripe_event_id) DO NOTHING
          RETURNING id
        `;
        if (inserted.length > 0) {
          const creditsToAdd = PLANS.pro.taskCredits + PLANS.pro.firstMonthBonus;
          await incrementProjectCredits(db, projectId as string, creditsToAdd);
        }
        const updated = await db`SELECT task_credits FROM projects WHERE id = ${projectId}`;
        return NextResponse.json({
          status: "active",
          credits: updated[0]?.task_credits,
        });
      }
      return NextResponse.json({
        status: "active",
        credits: project.task_credits,
      });
    }

    // Look up the user's Stripe customer
    const users = await db`SELECT stripe_customer_id FROM users WHERE id = ${user.id}`;
    const customerId = users[0]?.stripe_customer_id;
    if (!customerId) {
      return NextResponse.json({ status: "pending" });
    }

    // Check Stripe for active subscriptions
    const stripe = getStripe();
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId as string,
      status: "active",
      limit: 10,
    });

    // Find a subscription with matching project metadata
    const matchingSub = subscriptions.data.find(
      (sub) => sub.metadata?.projectId === projectId
    );

    if (!matchingSub) {
      return NextResponse.json({ status: "pending" });
    }

    // Subscription exists in Stripe but webhook hasn't processed — update DB now
    const subData = matchingSub as unknown as {
      current_period_start: number;
      current_period_end: number;
    };

    // Check if subscription record already exists (webhook may have partially processed)
    const existingSub = await db`
      SELECT id FROM subscriptions WHERE stripe_subscription_id = ${matchingSub.id}
    `;

    if (existingSub.length === 0) {
      await db`
        INSERT INTO subscriptions (project_id, user_id, stripe_subscription_id, stripe_customer_id, plan, status, current_period_start, current_period_end)
        VALUES (${projectId}, ${user.id}, ${matchingSub.id}, ${customerId}, 'pro_49', 'active',
          ${new Date(subData.current_period_start * 1000).toISOString()},
          ${new Date(subData.current_period_end * 1000).toISOString()})
        ON CONFLICT (stripe_subscription_id) DO NOTHING
      `;
    }

    // Update project status
    await db`
      UPDATE projects SET subscription_status = 'active', stripe_subscription_id = ${matchingSub.id},
        current_period_end = ${new Date(subData.current_period_end * 1000).toISOString()}
      WHERE id = ${projectId} AND subscription_status != 'active'
    `;

    // Check if credits were already added by webhook's invoice.paid handler or a previous verify call.
    const creditsAlreadyAdded = await db`
      SELECT id FROM stripe_webhook_events
      WHERE project_id = ${projectId}
        AND type IN ('invoice.paid', 'verify_credits_added')
        AND processed = TRUE
      LIMIT 1
    `;

    if (creditsAlreadyAdded.length === 0) {
      // Insert synthetic event as idempotency guard before adding credits
      const syntheticId = `verify_credits_${projectId}_${matchingSub.id}`;
      const inserted = await db`
        INSERT INTO stripe_webhook_events (stripe_event_id, type, livemode, processed, project_id, user_id)
        VALUES (${syntheticId}, 'verify_credits_added', FALSE, TRUE, ${projectId}, ${user.id})
        ON CONFLICT (stripe_event_id) DO NOTHING
        RETURNING id
      `;
      if (inserted.length > 0) {
        const creditsToAdd = PLANS.pro.taskCredits + PLANS.pro.firstMonthBonus;
        await incrementProjectCredits(db, projectId as string, creditsToAdd);
      }
    }

    const updatedProject = await db`SELECT task_credits, subscription_status FROM projects WHERE id = ${projectId}`;

    return NextResponse.json({
      status: "active",
      credits: updatedProject[0]?.task_credits,
    });
  } catch (err) {
    console.error("Verify subscription error:", err);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
