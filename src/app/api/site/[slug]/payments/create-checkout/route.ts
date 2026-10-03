import { NextRequest } from "next/server";
import { handlePreflight, createRateLimiter, getClientIp, getProjectBySlug, getWebsiteDb, requireSiteUser, isErrorResponse, jsonResponse } from "@/lib/site-api";
import { getCheckoutPlanByPublicId, PLATFORM_FEE_PERCENT } from "@/lib/marketplace";
import { getStripe } from "@/lib/stripe";

const isRateLimited = createRateLimiter(5);

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const origin = request.headers.get("origin");

  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return jsonResponse({ error: "Too many requests" }, 429, origin);
  }

  const project = await getProjectBySlug(slug);
  if (!project) return jsonResponse({ error: "Not found" }, 404, origin);

  const websiteDb = await getWebsiteDb(slug);
  if (!websiteDb) return jsonResponse({ error: "Database not available" }, 403, origin);

  const userOrError = await requireSiteUser(request, websiteDb, origin);
  if (isErrorResponse(userOrError)) return userOrError;

  let body: { planPublicId?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const { planPublicId } = body;
  if (!planPublicId) {
    return jsonResponse({ error: "planPublicId is required" }, 400, origin);
  }

  // Look up plan
  const plan = await getCheckoutPlanByPublicId(planPublicId);
  if (!plan || !plan.marketplaceEnabled) {
    return jsonResponse({ error: "Plan not found" }, 404, origin);
  }

  // Verify plan belongs to this project
  if (plan.projectSlug !== slug) {
    return jsonResponse({ error: "Plan not found" }, 404, origin);
  }

  // Ensure plan has a valid price
  if (!plan.amountCents || plan.amountCents <= 0) {
    return jsonResponse({ error: "Plan has no valid price" }, 400, origin);
  }

  const stripe = getStripe();
  const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
  const siteUrl = `https://${slug}.${companyDomain}`;
  const description = plan.features.slice(0, 4).join(" \u2022 ");

  const metadata = {
    type: "project_plan",
    projectId: plan.projectId,
    userId: plan.userId,
    planId: plan.id,
    planPublicId: plan.publicId,
    planName: plan.name,
    projectSlug: plan.projectSlug,
    platformFeePercent: String(PLATFORM_FEE_PERCENT),
    siteUserId: userOrError.id,
    siteUserEmail: userOrError.email,
  };

  const lineItem =
    plan.billingInterval === "one_time"
      ? {
          price_data: {
            currency: plan.currency,
            unit_amount: plan.amountCents,
            product_data: {
              name: `${plan.projectName} \u2014 ${plan.name}`,
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
              interval: plan.billingInterval as "month" | "year",
              interval_count: plan.intervalCount,
            },
            product_data: {
              name: `${plan.projectName} \u2014 ${plan.name}`,
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
    customer_email: userOrError.email,
    line_items: [lineItem],
    metadata,
    subscription_data:
      plan.billingInterval === "one_time"
        ? undefined
        : { metadata },
    success_url: `${siteUrl}?checkout=success&plan=${plan.slug}`,
    cancel_url: `${siteUrl}?checkout=cancelled&plan=${plan.slug}`,
  });

  if (!session.url) {
    return jsonResponse({ error: "Checkout session failed" }, 500, origin);
  }

  return jsonResponse({ checkoutUrl: session.url }, 200, origin);
}
