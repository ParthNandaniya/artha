import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const stripe = getStripe();
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, amountCents, method, paypalEmail } = await request.json();
  const normalizedMethod = method === "paypal" ? "paypal" : "stripe_bank";
  const db = getDb();

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "Invalid withdrawal amount" }, { status: 400 });
  }

  const projects = await db`
    SELECT revenue_balance_cents FROM projects WHERE id = ${projectId} AND user_id = ${user.id}
  `;
  if (projects.length === 0 || (projects[0].revenue_balance_cents as number) < amountCents) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
  }

  if (normalizedMethod === "paypal") {
    const email = String(paypalEmail || "").trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Enter a valid PayPal email" }, { status: 400 });
    }

    await db`UPDATE users SET paypal_payout_email = ${email} WHERE id = ${user.id}`;
    await db`
      INSERT INTO revenue_transactions (
        project_id,
        type,
        amount_cents,
        seller_net_amount_cents,
        currency,
        description,
        external_payout_method,
        external_payout_email,
        status,
        metadata
      )
      VALUES (
        ${projectId},
        'withdrawal',
        ${amountCents},
        ${amountCents},
        'usd',
        ${`PayPal payout requested for $${(amountCents / 100).toFixed(2)}`},
        'paypal',
        ${email},
        'pending',
        ${JSON.stringify({ requestedByUserId: user.id })}::jsonb
      )
    `;

    await db`
      UPDATE projects
      SET revenue_balance_cents = revenue_balance_cents - ${amountCents}
      WHERE id = ${projectId}
    `;

    return NextResponse.json({ success: true, status: "pending" });
  }

  const users = await db`
    SELECT stripe_connect_account_id
    FROM users
    WHERE id = ${user.id}
  `;
  const accountId = users[0]?.stripe_connect_account_id as string | undefined;
  if (!accountId) {
    return NextResponse.json({ error: "Please set up Stripe Connect first" }, { status: 400 });
  }

  try {
    const account = await stripe.accounts.retrieve(accountId);
    if (!account.details_submitted) {
      return NextResponse.json({ error: "Complete Stripe payout setup before withdrawing" }, { status: 400 });
    }

    const transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: "usd",
      destination: accountId,
      metadata: { projectId, userId: user.id },
    });

    await db`
      INSERT INTO revenue_transactions (
        project_id,
        type,
        amount_cents,
        seller_net_amount_cents,
        currency,
        description,
        stripe_transfer_id,
        external_payout_method,
        status,
        metadata
      )
      VALUES (
        ${projectId},
        'withdrawal',
        ${amountCents},
        ${amountCents},
        'usd',
        ${"Stripe withdrawal of $" + (amountCents / 100).toFixed(2)},
        ${transfer.id},
        'stripe_bank',
        'completed',
        ${JSON.stringify({ connectedAccountId: accountId })}::jsonb
      )
    `;

    await db`
      UPDATE projects SET revenue_balance_cents = revenue_balance_cents - ${amountCents}
      WHERE id = ${projectId}
    `;

    return NextResponse.json({ success: true, transferId: transfer.id });
  } catch (error) {
    return NextResponse.json({ error: "Transfer failed: " + String(error) }, { status: 500 });
  }
}
