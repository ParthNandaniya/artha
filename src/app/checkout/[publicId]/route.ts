import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getCheckoutPlanByPublicId, PLATFORM_FEE_PERCENT, ensureUserConnectAccount } from "@/lib/marketplace";

function errorPage(title: string, message: string, backUrl?: string, status = 404) {
  const back = backUrl || "javascript:history.back()";
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #e5e5e5; }
    .card { text-align: center; max-width: 420px; padding: 3rem 2rem; }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.75rem; }
    p { color: #a3a3a3; line-height: 1.6; margin-bottom: 1.5rem; }
    a { display: inline-block; padding: 0.625rem 1.5rem; border-radius: 8px; background: #262626; color: #e5e5e5; text-decoration: none; font-size: 0.875rem; transition: background 0.2s; }
    a:hover { background: #333; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="${back}">Go back</a>
  </div>
</body>
</html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> }
) {
  try {
    const stripe = getStripe();
    const { publicId } = await params;
    const plan = await getCheckoutPlanByPublicId(publicId);

    if (!plan) {
      return errorPage("Plan not found", "This pricing plan doesn't exist or is no longer available.");
    }

    if (!plan.marketplaceEnabled) {
      const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
      const siteUrl = `https://${plan.projectSlug}.${companyDomain}`;
      return errorPage(
        "Checkout not available yet",
        "The seller hasn't enabled payments for this product yet. Check back soon!",
        siteUrl,
        403,
      );
    }

    // Ensure a Connect account exists — create one if missing.
    // Stripe holds funds until the seller completes bank onboarding,
    // so checkout can proceed even before onboarding is done.
    let connectAccountId = plan.stripeConnectAccountId;
    if (!connectAccountId) {
      connectAccountId = await ensureUserConnectAccount(plan.userId);
      if (!connectAccountId) {
        const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
        const siteUrl = `https://${plan.projectSlug}.${companyDomain}`;
        return errorPage(
          "Checkout not available",
          "This seller's payment system is being configured. Please check back shortly!",
          siteUrl,
          503,
        );
      }
    }

    const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
    const siteUrl = `https://${plan.projectSlug}.${companyDomain}`;
    const description = plan.features.slice(0, 4).join(" • ");
    const metadata = {
      type: "project_plan",
      projectId: plan.projectId,
      userId: plan.userId,
      planId: plan.id,
      planPublicId: plan.publicId,
      planName: plan.name,
      projectSlug: plan.projectSlug,
      platformFeePercent: String(PLATFORM_FEE_PERCENT),
    };

    const lineItem =
      plan.billingInterval === "one_time"
        ? {
            price_data: {
              currency: plan.currency,
              unit_amount: plan.amountCents,
              product_data: {
                name: `${plan.projectName} — ${plan.name}`,
                description: description || `${plan.projectName} ${plan.name}`,
              },
            },
            quantity: 1,
          }
        : {
            price_data: {
              currency: plan.currency,
              unit_amount: plan.amountCents,
              recurring: {
                interval: plan.billingInterval,
                interval_count: plan.intervalCount,
              },
              product_data: {
                name: `${plan.projectName} — ${plan.name}`,
                description: description || `${plan.projectName} ${plan.name}`,
              },
            },
            quantity: 1,
          };

    const session = await stripe.checkout.sessions.create({
      mode: plan.billingInterval === "one_time" ? "payment" : "subscription",
      payment_method_types: ["card"],
      billing_address_collection: "auto",
      customer_creation: plan.billingInterval === "one_time" ? "always" : undefined,
      line_items: [lineItem],
      metadata,
      ...(plan.billingInterval === "one_time"
        ? {
            // One-time: destination charge — 5% to Artha, 95% to seller
            payment_intent_data: {
              application_fee_amount: Math.round(plan.amountCents * (PLATFORM_FEE_PERCENT / 100)),
              transfer_data: {
                destination: connectAccountId,
              },
              metadata,
            },
          }
        : {
            // Subscription: recurring — 5% to Artha, 95% to seller
            subscription_data: {
              metadata,
              application_fee_percent: PLATFORM_FEE_PERCENT,
              transfer_data: {
                destination: connectAccountId,
              },
            },
          }),
      success_url: `${siteUrl}?checkout=success&plan=${plan.slug}`,
      cancel_url: `${siteUrl}?checkout=cancelled&plan=${plan.slug}`,
    });

    if (!session.url) {
      return errorPage("Something went wrong", "We couldn't create a checkout session. Please try again.");
    }

    return NextResponse.redirect(session.url, 303);
  } catch (err) {
    console.error("[checkout] Error:", err);
    return errorPage(
      "Something went wrong",
      "We ran into an issue processing your checkout. Please try again later.",
      undefined,
      500,
    );
  }
}
