import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { getStripe } from "@/lib/stripe";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const users = await db`SELECT stripe_customer_id FROM users WHERE id = ${user.id}`;
  const stripeCustomerId = users[0]?.stripe_customer_id as string | null;

  if (!stripeCustomerId) {
    return NextResponse.json({ paymentMethod: null });
  }

  try {
    const stripe = getStripe();
    const paymentMethods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: "card",
      limit: 1,
    });

    if (paymentMethods.data.length === 0) {
      return NextResponse.json({ paymentMethod: null });
    }

    const pm = paymentMethods.data[0];
    return NextResponse.json({
      paymentMethod: {
        brand: pm.card?.brand,
        last4: pm.card?.last4,
        exp_month: pm.card?.exp_month,
        exp_year: pm.card?.exp_year,
      },
    });
  } catch {
    return NextResponse.json({ paymentMethod: null });
  }
}
