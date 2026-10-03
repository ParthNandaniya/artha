import { NextResponse } from "next/server";
import { getStripe, getStripeWebhookSecret, PLANS, CREDIT_PACK } from "@/lib/stripe";
import { getDb } from "@/lib/neon";
import {
  sendSubscriptionConfirmationEmail,
  sendPaymentFailedEmail,
  sendSubscriptionCancelledEmail,
  sendDeletionWarningEmail,
  sendWelcomeBackEmail,
} from "@/lib/postmark";
import Stripe from "stripe";
import { incrementProjectCredits } from "@/lib/project-credits";
import {
  recordMarketplaceIncome,
  createOrUpdateMarketplaceSubscriber,
  updateMarketplaceSubscriberStatus,
  updateMarketplaceSubscriberPeriod,
} from "@/lib/marketplace";
import { hibernateWebsiteDb, restoreWebsiteDb } from "@/lib/website-db";
import { rechargeCreditBalance } from "@/lib/database/templates";
import { addSiteUserCredits, getPlanCreditAmount } from "@/lib/site-api";
import { deployProjectWebsite } from "@/lib/website";

function getPlanCredits(_planKey?: string) {
  return PLANS.pro;
}

/**
 * Check and record revenue milestones (first sale, $100, $1000).
 * Non-blocking — errors are logged but don't affect payment processing.
 */
async function checkAndRecordMilestones(
  db: ReturnType<typeof getDb>,
  projectId: string,
  sellerNetAmountCents: number
) {
  try {
    // Get total revenue for this project
    const [{ total }] = await db`
      SELECT COALESCE(SUM(seller_net_amount_cents), 0)::int AS total
      FROM revenue_transactions
      WHERE project_id = ${projectId} AND type = 'income'
    `;
    const previousBalance = total - sellerNetAmountCents;

    const milestones: Array<{ type: string; title: string; amount: number }> = [];

    if (previousBalance === 0 && total > 0) {
      milestones.push({ type: "first_sale", title: "Made their first sale!", amount: sellerNetAmountCents });
    }
    if (previousBalance < 10000 && total >= 10000) {
      milestones.push({ type: "revenue_100", title: "Crossed $100 in revenue!", amount: total });
    }
    if (previousBalance < 100000 && total >= 100000) {
      milestones.push({ type: "revenue_1000", title: "Crossed $1,000 in revenue!", amount: total });
    }

    for (const m of milestones) {
      await db`
        INSERT INTO milestones (project_id, type, title, amount_cents)
        VALUES (${projectId}, ${m.type}, ${m.title}, ${m.amount})
        ON CONFLICT (project_id, type) DO NOTHING
      `;
    }

    // Send celebratory email for first sale
    if (milestones.some((m) => m.type === "first_sale")) {
      try {
        const [owner] = await db`
          SELECT u.email, u.name, p.name AS project_name
          FROM projects p JOIN users u ON u.id = p.user_id
          WHERE p.id = ${projectId}
        `;
        if (owner?.email) {
          const { sendMilestoneEmail } = await import("@/lib/postmark");
          await sendMilestoneEmail({
            toEmail: owner.email as string,
            founderName: owner.name as string | null,
            companyName: owner.project_name as string,
            milestoneType: "first_sale",
            amountCents: sellerNetAmountCents,
          });
        }
      } catch (emailErr) {
        console.error("Milestone email failed:", emailErr);
      }
    }
  } catch (err) {
    console.error("Milestone detection failed (non-blocking):", err);
  }
}

function mapStripeStatus(stripeStatus: Stripe.Subscription["status"]): string {
  const map: Record<string, string> = {
    active: "active",
    past_due: "past_due",
    unpaid: "past_due",
    trialing: "trialing",
    paused: "paused",
    canceled: "cancelled",
    incomplete: "past_due",
    incomplete_expired: "cancelled",
  };
  return map[stripeStatus] ?? "past_due";
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const withSubscription = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
  };
  const subscription = withSubscription.subscription;
  if (!subscription) return null;
  return typeof subscription === "string" ? subscription : subscription.id;
}

async function markEventProcessed(
  db: ReturnType<typeof getDb>,
  eventId: string,
  projectId?: string,
  userId?: string
) {
  await db`
    UPDATE stripe_webhook_events
    SET processed = TRUE,
        project_id = COALESCE(${projectId || null}, project_id),
        user_id = COALESCE(${userId || null}, user_id)
    WHERE stripe_event_id = ${eventId}
  `;
}

async function handleMarketplaceCheckoutCompleted(
  db: ReturnType<typeof getDb>,
  eventId: string,
  session: Stripe.Checkout.Session
) {
  const projectId = session.metadata?.projectId;
  const userId = session.metadata?.userId;
  if (!projectId || !userId) {
    await markEventProcessed(db, eventId);
    return;
  }

  const customerEmail = session.customer_details?.email;
  const customerName = session.customer_details?.name;
  const grossAmountCents = session.amount_total ?? 0;
  const isOneTime = session.mode === "payment";
  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : (session.subscription as Stripe.Subscription | null)?.id || null;

  if (isOneTime && grossAmountCents > 0) {
    await recordMarketplaceIncome({
      db,
      projectId,
      description: `${session.metadata?.planName || "Plan"} purchase`,
      grossAmountCents,
      currency: session.currency || "usd",
      checkoutSessionId: session.id,
      paymentIntentId:
        typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
      metadata: {
        customerEmail: customerEmail || null,
        planId: session.metadata?.planId || null,
        planPublicId: session.metadata?.planPublicId || null,
        checkoutMode: session.mode,
      },
    });
  }

  // Track subscriber
  if (customerEmail) {
    await createOrUpdateMarketplaceSubscriber({
      projectId,
      email: customerEmail,
      name: customerName,
      stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
      stripeSubscriptionId: subscriptionId,
      planId: session.metadata?.planId || null,
      planName: session.metadata?.planName || null,
      status: isOneTime ? "one_time" : "active",
      amountCents: grossAmountCents,
      currency: session.currency || "usd",
      billingInterval: isOneTime ? null : null, // set from subscription metadata if available
      metadata: { checkoutSessionId: session.id },
    });

    // Notify project owner about new subscriber
    try {
      const ownerRows = await db`
        SELECT u.email, u.name, p.name AS project_name
        FROM projects p JOIN users u ON u.id = p.user_id
        WHERE p.id = ${projectId}
      `;
      if (ownerRows[0]?.email) {
        const { sendNewSubscriberNotification } = await import("@/lib/postmark");
        const { getSubscriberSummary } = await import("@/lib/marketplace");
        const subSummary = await getSubscriberSummary(projectId).catch(() => ({ activeCount: 0 }));
        sendNewSubscriberNotification({
          toEmail: ownerRows[0].email as string,
          companyName: ownerRows[0].project_name as string,
          customerEmail,
          customerName: customerName || null,
          planName: session.metadata?.planName || "Plan",
          amountCents: grossAmountCents,
          billingInterval: session.mode === "subscription" ? "month" : "one-time",
          activeSubscriberCount: subSummary.activeCount,
        }).catch((err) => console.error("New subscriber notification failed:", err));
      }
    } catch (err) {
      console.error("Subscriber notification lookup failed:", err);
    }
  }

  // Check revenue milestones (first sale, $100, $1000)
  if (grossAmountCents > 0) {
    const { calculateMarketplaceSplit } = await import("@/lib/marketplace");
    const split = calculateMarketplaceSplit(grossAmountCents);
    checkAndRecordMilestones(db, projectId, split.sellerNetAmountCents);
  }

  // Add credits to site user if applicable
  const siteUserId = session.metadata?.siteUserId;
  const siteUserEmail = session.metadata?.siteUserEmail || session.customer_details?.email;
  const planId = session.metadata?.planId;
  if (planId && (siteUserId || siteUserEmail)) {
    const creditAmount = await getPlanCreditAmount(planId);
    if (creditAmount > 0) {
      addSiteUserCredits({
        projectId,
        siteUserId,
        siteUserEmail,
        credits: creditAmount,
        reason: `${session.metadata?.planName || "Plan"} purchase`,
      }).catch((err) => console.error("Site user credit error:", err));
    }
  }

  await markEventProcessed(db, eventId, projectId, userId);
}

async function handleMarketplaceInvoicePaid(
  db: ReturnType<typeof getDb>,
  eventId: string,
  invoice: Stripe.Invoice,
  subscription: Stripe.Subscription
) {
  const projectId = subscription.metadata?.projectId;
  const userId = subscription.metadata?.userId;
  if (!projectId || !userId) {
    await markEventProcessed(db, eventId);
    return;
  }

  const grossAmountCents = invoice.amount_paid || invoice.total || 0;
  if (grossAmountCents > 0) {
    await recordMarketplaceIncome({
      db,
      projectId,
      description: `${subscription.metadata?.planName || "Subscription"} payment`,
      grossAmountCents,
      currency: invoice.currency || "usd",
      invoiceId: invoice.id,
      subscriptionId: subscription.id,
      metadata: {
        billingReason: invoice.billing_reason || null,
        customerEmail: invoice.customer_email || null,
        planId: subscription.metadata?.planId || null,
        planPublicId: subscription.metadata?.planPublicId || null,
      },
    });
  }

  // Check revenue milestones
  if (grossAmountCents > 0) {
    const { calculateMarketplaceSplit } = await import("@/lib/marketplace");
    const split = calculateMarketplaceSplit(grossAmountCents);
    checkAndRecordMilestones(db, projectId, split.sellerNetAmountCents);
  }

  // Update subscriber period
  if (subscription.id) {
    const subData = subscription as unknown as { current_period_end: number };
    if (subData.current_period_end) {
      updateMarketplaceSubscriberPeriod(
        subscription.id,
        new Date(subData.current_period_end * 1000).toISOString()
      ).catch((err) => console.error("Subscriber period update error:", err));
    }
  }

  // Credit recharge for marketplace subscriptions
  const customerEmail = invoice.customer_email;
  if (customerEmail && invoice.billing_reason !== "subscription_create") {
    const planMeta = subscription.metadata;
    const credits = planMeta?.credits ? parseInt(planMeta.credits, 10) : 0;
    if (credits > 0) {
      rechargeCreditBalance(projectId, customerEmail, credits).catch((err) =>
        console.error("Credit recharge error:", err)
      );
    }
  }

  // Add credits to site user (works for both initial and renewal)
  const siteUserId = subscription.metadata?.siteUserId;
  const siteUserEmail = subscription.metadata?.siteUserEmail || invoice.customer_email;
  const planId = subscription.metadata?.planId;
  if (planId && (siteUserId || siteUserEmail)) {
    const creditAmount = await getPlanCreditAmount(planId);
    if (creditAmount > 0) {
      addSiteUserCredits({
        projectId,
        siteUserId,
        siteUserEmail,
        credits: creditAmount,
        reason: `${subscription.metadata?.planName || "Subscription"} ${invoice.billing_reason === "subscription_create" ? "purchase" : "renewal"}`,
      }).catch((err) => console.error("Site user credit error:", err));
    }
  }

  await markEventProcessed(db, eventId, projectId, userId);
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, getStripeWebhookSecret());
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = getDb();

  const existing = await db`
    SELECT id, processed FROM stripe_webhook_events WHERE stripe_event_id = ${event.id}
  `;

  if (existing.length > 0 && existing[0].processed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (existing.length === 0) {
    await db`
      INSERT INTO stripe_webhook_events (stripe_event_id, type, livemode, processed, payload)
      VALUES (${event.id}, ${event.type}, ${event.livemode}, FALSE, ${JSON.stringify(event.data.object)}::jsonb)
    `;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const projectId = session.metadata?.projectId;
        const userId = session.metadata?.userId;

        if (session.metadata?.type === "project_plan") {
          await handleMarketplaceCheckoutCompleted(db, event.id, session);
          break;
        }

        if (!projectId || !userId) {
          await markEventProcessed(db, event.id);
          break;
        }

        const isCreditPack = session.metadata?.type === "credit_pack";

        if (isCreditPack) {
          const packCredits = parseInt(session.metadata?.credits || String(CREDIT_PACK.credits), 10);

          await incrementProjectCredits(db, projectId, packCredits);

          await markEventProcessed(db, event.id, projectId, userId);
        } else {
          const subscriptionId =
            typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
          if (!subscriptionId) {
            await markEventProcessed(db, event.id, projectId, userId);
            break;
          }
          const subResponse = await stripe.subscriptions.retrieve(subscriptionId);
          const sub = subResponse as unknown as { current_period_start: number; current_period_end: number };

          const planKey = session.metadata?.plan || "pro";
          const planLabel = planKey === "starter" ? "starter_19" : "pro_49";

          // Store plan key in Stripe subscription metadata so renewals know the credit amount
          await stripe.subscriptions.update(subscriptionId, {
            metadata: { ...subResponse.metadata, plan: planKey, projectId: projectId!, userId: userId! },
          });

          await db`
            INSERT INTO subscriptions (project_id, user_id, stripe_subscription_id, stripe_customer_id, plan, status, current_period_start, current_period_end)
            VALUES (${projectId}, ${userId}, ${subscriptionId}, ${session.customer as string}, ${planLabel}, 'active',
              ${new Date(sub.current_period_start * 1000).toISOString()},
              ${new Date(sub.current_period_end * 1000).toISOString()})
          `;

          await db`
            UPDATE projects SET subscription_status = 'active', stripe_subscription_id = ${subscriptionId},
              current_period_end = ${new Date(sub.current_period_end * 1000).toISOString()}
            WHERE id = ${projectId}
          `;

          await markEventProcessed(db, event.id, projectId, userId);

          const subUsers = await db`SELECT email, name FROM users WHERE id = ${userId}`;
          const subProjects = await db`SELECT name FROM projects WHERE id = ${projectId}`;
          if (subUsers[0]?.email) {
            sendSubscriptionConfirmationEmail(
              subUsers[0].email as string,
              subUsers[0].name as string | null,
              (subProjects[0]?.name as string) || "Your company",
              "Pro"
            ).catch((err) => console.error("Subscription email failed:", err));
          }

          // Restore website DB if re-subscribing (clears expiry, restores schema)
          const projectSlug = await db`SELECT slug FROM projects WHERE id = ${projectId}`;
          if (projectSlug[0]?.slug) {
            restoreWebsiteDb(projectId, projectSlug[0].slug as string).catch((err) =>
              console.error("Restore website DB error:", err)
            );
            if (subUsers[0]?.email) {
              sendWelcomeBackEmail(
                subUsers[0].email as string,
                (subProjects[0]?.name as string) || "Your company"
              ).catch((err) => console.error("Welcome back email error:", err));
            }
          }

          // Redeploy website to remove "Powered by Artha" badge now that user is Pro
          deployProjectWebsite(projectId).catch((err) =>
            console.error("Post-subscription redeploy error:", err)
          );
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = getInvoiceSubscriptionId(invoice);
        if (subscriptionId) {
          const subs = await db`SELECT project_id FROM subscriptions WHERE stripe_subscription_id = ${subscriptionId}`;
          if (subs.length > 0) {
            const subResponse = await stripe.subscriptions.retrieve(subscriptionId);
            const subData = subResponse as unknown as { current_period_start: number; current_period_end: number };

            const isFirstPayment = invoice.billing_reason === "subscription_create";
            // Look up plan from subscription metadata to support Starter vs Pro
            const planMeta = subResponse.metadata?.plan as string | undefined;
            const { taskCredits, firstMonthBonus } = getPlanCredits(planMeta);
            const creditsToAdd = isFirstPayment
              ? taskCredits + firstMonthBonus
              : taskCredits;

            await incrementProjectCredits(db, subs[0].project_id as string, creditsToAdd);
            await db`
              UPDATE projects
              SET current_period_end = ${new Date(subData.current_period_end * 1000).toISOString()},
                  subscription_status = 'active'
              WHERE id = ${subs[0].project_id}
            `;

            // If recovering from payment failure, clear deletion cycle
            const projectForRecovery = await db`
              SELECT slug, website_db_expires_at FROM projects WHERE id = ${subs[0].project_id}
            `;
            if (projectForRecovery[0]?.website_db_expires_at) {
              await db`
                UPDATE projects
                SET website_db_expires_at = NULL, last_deletion_warning_at = NULL
                WHERE id = ${subs[0].project_id}
              `;
            }

            await db`
              UPDATE subscriptions SET
                current_period_start = ${new Date(subData.current_period_start * 1000).toISOString()},
                current_period_end = ${new Date(subData.current_period_end * 1000).toISOString()}
              WHERE stripe_subscription_id = ${subscriptionId}
            `;

            await markEventProcessed(db, event.id, subs[0].project_id as string);
          } else {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            if (subscription.metadata?.type === "project_plan") {
              await handleMarketplaceInvoicePaid(db, event.id, invoice, subscription);
            } else {
              await markEventProcessed(db, event.id);
            }
          }
        } else {
          await markEventProcessed(db, event.id);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = getInvoiceSubscriptionId(invoice);
        if (subscriptionId) {
          const subs = await db`SELECT project_id, user_id FROM subscriptions WHERE stripe_subscription_id = ${subscriptionId}`;
          if (subs.length > 0) {
            await db`UPDATE subscriptions SET status = 'past_due' WHERE stripe_subscription_id = ${subscriptionId}`;
            await db`UPDATE projects SET subscription_status = 'past_due' WHERE id = ${subs[0].project_id}`;
            await markEventProcessed(db, event.id, subs[0].project_id as string, subs[0].user_id as string);

            const failUsers = await db`SELECT email, name FROM users WHERE id = ${subs[0].user_id}`;
            const failProjects = await db`SELECT name FROM projects WHERE id = ${subs[0].project_id}`;
            if (failUsers[0]?.email) {
              sendPaymentFailedEmail(
                failUsers[0].email as string,
                failUsers[0].name as string | null,
                (failProjects[0]?.name as string) || "Your company"
              ).catch((err) => console.error("Payment failed email error:", err));

              // Hibernate website DB + send deletion warning
              hibernateWebsiteDb(subs[0].project_id as string).catch((err) =>
                console.error("Hibernate website DB error:", err)
              );
              sendDeletionWarningEmail(
                failUsers[0].email as string,
                (failProjects[0]?.name as string) || "Your company",
                60
              ).catch((err) => console.error("Deletion warning email error:", err));
            }
          } else {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            if (subscription.metadata?.type === "project_plan") {
              await markEventProcessed(
                db,
                event.id,
                subscription.metadata.projectId,
                subscription.metadata.userId
              );
            } else {
              await markEventProcessed(db, event.id);
            }
          }
        } else {
          await markEventProcessed(db, event.id);
        }
        break;
      }

      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        const subscription = event.data.object as Stripe.Subscription;
        const newStatus = event.type === "customer.subscription.paused" ? "paused" : "active";
        const subs = await db`SELECT project_id FROM subscriptions WHERE stripe_subscription_id = ${subscription.id}`;
        if (subs.length > 0) {
          await db`UPDATE subscriptions SET status = ${newStatus} WHERE stripe_subscription_id = ${subscription.id}`;
          await db`UPDATE projects SET subscription_status = ${newStatus} WHERE id = ${subs[0].project_id}`;
          await markEventProcessed(db, event.id, subs[0].project_id as string);
        } else {
          await markEventProcessed(
            db,
            event.id,
            subscription.metadata?.type === "project_plan" ? subscription.metadata.projectId : undefined,
            subscription.metadata?.type === "project_plan" ? subscription.metadata.userId : undefined
          );
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const status = mapStripeStatus(subscription.status);
        const subData = subscription as unknown as { current_period_start: number; current_period_end: number };
        const subs = await db`SELECT project_id FROM subscriptions WHERE stripe_subscription_id = ${subscription.id}`;
        if (subs.length > 0) {
          await db`
            UPDATE subscriptions SET status = ${status},
              current_period_start = ${new Date(subData.current_period_start * 1000).toISOString()},
              current_period_end = ${new Date(subData.current_period_end * 1000).toISOString()}
            WHERE stripe_subscription_id = ${subscription.id}
          `;
          await db`
            UPDATE projects SET subscription_status = ${status},
              current_period_end = ${new Date(subData.current_period_end * 1000).toISOString()}
            WHERE id = ${subs[0].project_id}
          `;
          await markEventProcessed(db, event.id, subs[0].project_id as string);
        } else if (subscription.metadata?.type === "project_plan") {
          // Marketplace subscription status sync
          const mappedStatus = status === "cancelled" ? "canceled" : status === "active" ? "active" : "past_due";
          updateMarketplaceSubscriberStatus(subscription.id, mappedStatus as "active" | "past_due" | "canceled").catch(
            (err) => console.error("Marketplace subscriber status update error:", err)
          );
          await markEventProcessed(db, event.id, subscription.metadata.projectId, subscription.metadata.userId);
        } else {
          await markEventProcessed(db, event.id);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const cancelSubs = await db`SELECT project_id, user_id FROM subscriptions WHERE stripe_subscription_id = ${subscription.id}`;
        await db`UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE stripe_subscription_id = ${subscription.id}`;
        if (cancelSubs.length > 0) {
          await db`UPDATE projects SET subscription_status = 'cancelled' WHERE id = ${cancelSubs[0].project_id}`;
          await markEventProcessed(db, event.id, cancelSubs[0].project_id as string, cancelSubs[0].user_id as string);

          const cancelUsers = await db`SELECT email, name FROM users WHERE id = ${cancelSubs[0].user_id}`;
          const cancelProjects = await db`SELECT name FROM projects WHERE id = ${cancelSubs[0].project_id}`;
          if (cancelUsers[0]?.email) {
            sendSubscriptionCancelledEmail(
              cancelUsers[0].email as string,
              cancelUsers[0].name as string | null,
              (cancelProjects[0]?.name as string) || "Your company"
            ).catch((err) => console.error("Cancellation email error:", err));

            // Hibernate website DB + send deletion warning
            hibernateWebsiteDb(cancelSubs[0].project_id as string).catch((err) =>
              console.error("Hibernate website DB error:", err)
            );
            sendDeletionWarningEmail(
              cancelUsers[0].email as string,
              (cancelProjects[0]?.name as string) || "Your company",
              60
            ).catch((err) => console.error("Deletion warning email error:", err));
          }
        } else if (subscription.metadata?.type === "project_plan") {
          // Marketplace subscription canceled
          updateMarketplaceSubscriberStatus(subscription.id, "canceled", new Date().toISOString()).catch(
            (err) => console.error("Marketplace subscriber cancellation error:", err)
          );
          await markEventProcessed(db, event.id, subscription.metadata.projectId, subscription.metadata.userId);
        } else {
          await markEventProcessed(db, event.id);
        }
        break;
      }

      default:
        await markEventProcessed(db, event.id);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await db`UPDATE stripe_webhook_events SET error_message = ${errorMsg} WHERE stripe_event_id = ${event.id}`;
    console.error("Webhook processing error:", err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
