import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { getStripe, PLANS, type PlanKey } from "@/lib/stripe";
import { CheckoutSchema, parseBody } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const stripe = getStripe();
    const user = await getSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const raw = await request.json();
    const parsed = parseBody(CheckoutSchema, raw);
    if (!parsed.success) return parsed.response;
    const { projectId, plan: planKey } = parsed.data;
    const plan = PLANS[planKey as PlanKey];
    const db = getDb();

    const projects = await db`SELECT * FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
    if (projects.length === 0) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const project = projects[0];

    // Prevent duplicate subscriptions — one subscription per company
    if (project.subscription_status === "active") {
      return NextResponse.json({ error: "This company already has an active subscription" }, { status: 400 });
    }

    const users = await db`SELECT stripe_customer_id FROM users WHERE id = ${user.id}`;
    let customerId = users[0]?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await db`UPDATE users SET stripe_customer_id = ${customerId} WHERE id = ${user.id}`;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          price_data: {
            currency: "usd",
            recurring: { interval: "month" },
            product_data: {
              name: `Artha ${plan.name}`,
              description: `${plan.taskCredits} task credits per month + ${plan.firstMonthBonus} bonus credits on month one`,
            },
            unit_amount: plan.price,
          },
          quantity: 1,
        },
      ],
      metadata: { projectId: project.id as string, userId: user.id, type: "artha_subscription", plan: planKey },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://artha.run"}/dashboard/${project.slug}?subscribed=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://artha.run"}/dashboard/${project.slug}?cancelled=true`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "Failed to create checkout session", detail: message }, { status: 500 });
  }
}
