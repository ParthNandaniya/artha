import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { getStripe, CREDIT_PACK } from "@/lib/stripe";
import { CreditPackSchema, parseBody } from "@/lib/validation";

export async function POST(request: Request) {
  try {
  const stripe = getStripe();
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json();
  const parsed = parseBody(CreditPackSchema, raw);
  if (!parsed.success) return parsed.response;
  const { projectId } = parsed.data;

  const db = getDb();
  const projects = await db`SELECT * FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const project = projects[0];

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
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Artha ${CREDIT_PACK.name}`,
            description: `${CREDIT_PACK.credits} task credits`,
          },
          unit_amount: CREDIT_PACK.price,
        },
        quantity: 1,
      },
    ],
    metadata: {
      projectId: project.id as string,
      userId: user.id,
      type: "credit_pack",
      credits: String(CREDIT_PACK.credits),
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://artha.run"}/dashboard/${project.slug}?credits_purchased=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://artha.run"}/dashboard/${project.slug}`,
  });

  return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Credit pack checkout error:", err);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
