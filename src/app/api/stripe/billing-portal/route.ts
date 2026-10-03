import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const users = await db`SELECT stripe_customer_id FROM users WHERE id = ${user.id}`;
  const stripeCustomerId = users[0]?.stripe_customer_id as string | null;

  if (!stripeCustomerId) {
    return NextResponse.json({ error: "No Stripe customer found" }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://artha.run"}/dashboard?panel=settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to create billing portal: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
