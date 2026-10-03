import { randomUUID } from "crypto";
import { getDb, type DbClient } from "@/lib/neon";
import { getStripe } from "@/lib/stripe";

export const PLATFORM_FEE_PERCENT = 5;
export const SELLER_SHARE_PERCENT = 100 - PLATFORM_FEE_PERCENT;

export type BillingInterval = "month" | "year" | "one_time";

export type GeneratedPricingPlan = {
  name: string;
  price: string;
  period: string;
  features: string[];
  ctaText: string;
  creditAmount?: number;
};

export type SyncedPricingPlan = {
  id: string;
  publicId: string;
  slug: string;
  name: string;
  amountCents: number;
  currency: string;
  billingInterval: BillingInterval;
  intervalCount: number;
  ctaText: string;
  features: string[];
  sortOrder: number;
  checkoutUrl: string;
  creditAmount: number;
};

type ProjectPricingPlanRow = {
  id: string;
  project_id: string;
  public_id: string;
  slug: string;
  name: string;
  amount_cents: number;
  currency: string;
  billing_interval: BillingInterval;
  interval_count: number;
  cta_text: string | null;
  features: string[] | string | null;
  active: boolean;
  sort_order: number;
  credit_amount: number;
};

function normalizeCurrency(value?: string | null): string {
  return (value || "usd").trim().toLowerCase() || "usd";
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "plan";
}

function normalizeFeatures(features: unknown): string[] {
  if (!Array.isArray(features)) return [];
  return features
    .map((feature) => String(feature || "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeAmount(price: string): number | null {
  const raw = price.trim().toLowerCase();
  if (!raw || raw.includes("free") || raw.includes("custom") || raw.includes("contact")) {
    return null;
  }

  const numeric = raw.replace(/[^0-9.,]/g, "").replace(/,/g, "");
  if (!numeric) return null;

  const amount = Number.parseFloat(numeric);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

function normalizeInterval(period: string): { billingInterval: BillingInterval; intervalCount: number } {
  const normalized = period.trim().toLowerCase();

  if (!normalized || ["once", "one-time", "one time", "lifetime"].includes(normalized)) {
    return { billingInterval: "one_time", intervalCount: 1 };
  }

  if (["yr", "year", "annual", "annually", "yearly"].some((value) => normalized.includes(value))) {
    return { billingInterval: "year", intervalCount: 1 };
  }

  return { billingInterval: "month", intervalCount: 1 };
}

export function shouldProvisionPricingCheckout(prompt: string): boolean {
  return /\b(pricing|price|plan|plans|tier|tiers|checkout|billing|subscription|monthly|annual|yearly)\b/i.test(
    prompt
  );
}

export function calculateMarketplaceSplit(grossAmountCents: number, feePercent = PLATFORM_FEE_PERCENT) {
  const platformFeeCents = Math.round((grossAmountCents * feePercent) / 100);
  const sellerNetAmountCents = Math.max(grossAmountCents - platformFeeCents, 0);
  return {
    grossAmountCents,
    platformFeeCents,
    sellerNetAmountCents,
  };
}

export async function ensureUserConnectAccount(userId: string): Promise<string | null> {
  const stripe = getStripe();
  const db = getDb();
  const users = await db`
    SELECT email, stripe_connect_account_id
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `;
  const user = users[0] as { email: string; stripe_connect_account_id: string | null } | undefined;
  if (!user) {
    throw new Error("User not found");
  }

  let accountId = user.stripe_connect_account_id;
  if (!accountId) {
    try {
      const account = await stripe.accounts.create({
        type: "express",
        email: user.email,
        metadata: { userId },
      });
      accountId = account.id;
      await db`UPDATE users SET stripe_connect_account_id = ${accountId} WHERE id = ${userId}`;
    } catch (err) {
      // Stripe Connect not enabled on this account — pricing sections will
      // render with fallback CTA links instead of checkout URLs.
      console.warn("[marketplace] Stripe Connect account creation failed (Connect may not be enabled):", err instanceof Error ? err.message : err);
      return null;
    }
  }

  return accountId;
}

export async function createConnectManagementLink(userId: string) {
  const stripe = getStripe();
  const accountId = await ensureUserConnectAccount(userId);
  if (!accountId) {
    throw new Error("Stripe Connect is not available. Please enable Connect on your Stripe dashboard.");
  }
  const account = await stripe.accounts.retrieve(accountId);

  if (account.details_submitted) {
    const loginLink = await stripe.accounts.createLoginLink(accountId);
    return { url: loginLink.url, accountId, onboardingComplete: true };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://artha.run";
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/dashboard?connect_refresh=true`,
    return_url: `${appUrl}/dashboard?connect_success=true`,
    type: "account_onboarding",
  });

  return { url: accountLink.url, accountId, onboardingComplete: false };
}

function buildCheckoutUrl(publicId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://artha.run";
  return `${appUrl}/checkout/${publicId}`;
}

function toSyncedPlan(row: ProjectPricingPlanRow): SyncedPricingPlan {
  return {
    id: row.id,
    publicId: row.public_id,
    slug: row.slug,
    name: row.name,
    amountCents: Number(row.amount_cents),
    currency: normalizeCurrency(row.currency),
    billingInterval: row.billing_interval,
    intervalCount: Number(row.interval_count),
    ctaText: row.cta_text || "Get started",
    features: normalizeFeatures(row.features),
    sortOrder: Number(row.sort_order),
    checkoutUrl: buildCheckoutUrl(row.public_id),
    creditAmount: Number(row.credit_amount) || 0,
  };
}

export function normalizeGeneratedPricingPlans(plans: GeneratedPricingPlan[]): Array<Omit<SyncedPricingPlan, "id" | "publicId" | "checkoutUrl">> {
  return plans
    .map((plan, index) => {
      const amountCents = normalizeAmount(plan.price);
      if (!amountCents) return null;

      const { billingInterval, intervalCount } = normalizeInterval(plan.period);
      const slug = slugify(plan.name || `plan-${index + 1}`);

      return {
        slug,
        name: plan.name.trim() || `Plan ${index + 1}`,
        amountCents,
        currency: "usd",
        billingInterval,
        intervalCount,
        ctaText: plan.ctaText?.trim() || "Get started",
        features: normalizeFeatures(plan.features),
        sortOrder: index,
        creditAmount: Math.max(0, Math.floor(plan.creditAmount || 0)),
      };
    })
    .filter((plan): plan is Omit<SyncedPricingPlan, "id" | "publicId" | "checkoutUrl"> => Boolean(plan));
}

export async function syncProjectPricingPlans(args: {
  projectId: string;
  userId: string;
  plans: GeneratedPricingPlan[];
}): Promise<SyncedPricingPlan[]> {
  const { projectId, userId, plans } = args;
  const db = getDb();

  await ensureUserConnectAccount(userId);

  const normalizedPlans = normalizeGeneratedPricingPlans(plans);
  const activeSlugs = new Set(normalizedPlans.map((plan) => plan.slug));

  const existingRows = await db`
    SELECT *
    FROM project_pricing_plans
    WHERE project_id = ${projectId}
  `;
  const existingPlans = new Map(
    existingRows.map((row) => [String((row as ProjectPricingPlanRow).slug), row as ProjectPricingPlanRow])
  );

  const syncedPlans: SyncedPricingPlan[] = [];
  for (const plan of normalizedPlans) {
    const existing = existingPlans.get(plan.slug);
    const publicId = existing?.public_id || randomUUID();

    const rows = await db`
      INSERT INTO project_pricing_plans (
        project_id,
        public_id,
        slug,
        name,
        amount_cents,
        currency,
        billing_interval,
        interval_count,
        cta_text,
        features,
        active,
        sort_order,
        credit_amount,
        metadata,
        updated_at
      )
      VALUES (
        ${projectId},
        ${publicId},
        ${plan.slug},
        ${plan.name},
        ${plan.amountCents},
        ${plan.currency},
        ${plan.billingInterval},
        ${plan.intervalCount},
        ${plan.ctaText},
        ${JSON.stringify(plan.features)}::jsonb,
        TRUE,
        ${plan.sortOrder},
        ${plan.creditAmount},
        ${JSON.stringify({ source: "website_builder" })}::jsonb,
        NOW()
      )
      ON CONFLICT (project_id, slug) DO UPDATE SET
        name = EXCLUDED.name,
        amount_cents = EXCLUDED.amount_cents,
        currency = EXCLUDED.currency,
        billing_interval = EXCLUDED.billing_interval,
        interval_count = EXCLUDED.interval_count,
        cta_text = EXCLUDED.cta_text,
        features = EXCLUDED.features,
        active = TRUE,
        sort_order = EXCLUDED.sort_order,
        credit_amount = EXCLUDED.credit_amount,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING *
    `;

    syncedPlans.push(toSyncedPlan(rows[0] as ProjectPricingPlanRow));
  }

  for (const existing of existingPlans.values()) {
    if (activeSlugs.has(existing.slug)) continue;
    await db`
      UPDATE project_pricing_plans
      SET active = FALSE, updated_at = NOW()
      WHERE id = ${existing.id}
    `;
  }

  await db`
    UPDATE projects
    SET marketplace_enabled = ${syncedPlans.length > 0}
    WHERE id = ${projectId}
  `;

  return syncedPlans;
}

export async function getCheckoutPlanByPublicId(publicId: string) {
  const db = getDb();
  const rows = await db`
    SELECT
      plans.id,
      plans.public_id,
      plans.slug,
      plans.name,
      plans.amount_cents,
      plans.currency,
      plans.billing_interval,
      plans.interval_count,
      plans.cta_text,
      plans.features,
      plans.active,
      plans.sort_order,
      projects.id AS project_id,
      projects.name AS project_name,
      projects.slug AS project_slug,
      projects.marketplace_enabled,
      users.id AS user_id,
      users.stripe_connect_account_id
    FROM project_pricing_plans AS plans
    INNER JOIN projects ON projects.id = plans.project_id
    INNER JOIN users ON users.id = projects.user_id
    WHERE plans.public_id = ${publicId}
      AND plans.active = TRUE
    LIMIT 1
  `;

  const row = rows[0] as
    | (ProjectPricingPlanRow & {
        project_name: string;
        project_slug: string;
        marketplace_enabled: boolean;
        user_id: string;
        stripe_connect_account_id: string | null;
      })
    | undefined;
  if (!row) return null;

  return {
    ...toSyncedPlan(row),
    projectId: row.project_id,
    projectName: row.project_name,
    projectSlug: row.project_slug,
    marketplaceEnabled: Boolean(row.marketplace_enabled),
    userId: row.user_id,
    stripeConnectAccountId: row.stripe_connect_account_id,
  };
}

export async function recordMarketplaceIncome(args: {
  db: DbClient;
  projectId: string;
  description: string;
  grossAmountCents: number;
  currency?: string;
  checkoutSessionId?: string | null;
  paymentIntentId?: string | null;
  invoiceId?: string | null;
  subscriptionId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const {
    db,
    projectId,
    description,
    grossAmountCents,
    currency = "usd",
    checkoutSessionId,
    paymentIntentId,
    invoiceId,
    subscriptionId,
    metadata,
  } = args;

  const { platformFeeCents, sellerNetAmountCents } = calculateMarketplaceSplit(grossAmountCents);
  const inserted = await db`
    INSERT INTO revenue_transactions (
      project_id,
      type,
      amount_cents,
      gross_amount_cents,
      platform_fee_cents,
      seller_net_amount_cents,
      currency,
      description,
      stripe_checkout_session_id,
      stripe_payment_intent_id,
      stripe_invoice_id,
      stripe_subscription_id,
      status,
      metadata
    )
    VALUES (
      ${projectId},
      'income',
      ${sellerNetAmountCents},
      ${grossAmountCents},
      ${platformFeeCents},
      ${sellerNetAmountCents},
      ${normalizeCurrency(currency)},
      ${description},
      ${checkoutSessionId || null},
      ${paymentIntentId || null},
      ${invoiceId || null},
      ${subscriptionId || null},
      'completed',
      ${JSON.stringify(metadata || {})}::jsonb
    )
    ON CONFLICT DO NOTHING
    RETURNING id
  `;

  if (inserted.length === 0) {
    return {
      inserted: false,
      grossAmountCents,
      platformFeeCents,
      sellerNetAmountCents,
    };
  }

  await db`
    UPDATE projects
    SET revenue_balance_cents = COALESCE(revenue_balance_cents, 0) + ${sellerNetAmountCents}
    WHERE id = ${projectId}
  `;

  return {
    inserted: true,
    grossAmountCents,
    platformFeeCents,
    sellerNetAmountCents,
  };
}

// ── Marketplace Subscribers ─────────────────────────────────────────

export async function createOrUpdateMarketplaceSubscriber(args: {
  projectId: string;
  email: string;
  name?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  planId?: string | null;
  planName?: string | null;
  status: "active" | "past_due" | "canceled" | "one_time";
  amountCents?: number | null;
  currency?: string;
  billingInterval?: string | null;
  currentPeriodEnd?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const db = getDb();
  const rows = await db`
    INSERT INTO marketplace_subscribers (
      project_id, email, name, stripe_customer_id, stripe_subscription_id,
      plan_id, plan_name, status, amount_cents, currency, billing_interval,
      current_period_end, metadata
    ) VALUES (
      ${args.projectId}, ${args.email}, ${args.name || null},
      ${args.stripeCustomerId || null}, ${args.stripeSubscriptionId || null},
      ${args.planId || null}, ${args.planName || null}, ${args.status},
      ${args.amountCents || null}, ${args.currency || "usd"},
      ${args.billingInterval || null}, ${args.currentPeriodEnd || null},
      ${JSON.stringify(args.metadata || {})}::jsonb
    )
    ON CONFLICT (project_id, email, plan_id) DO UPDATE SET
      name = COALESCE(EXCLUDED.name, marketplace_subscribers.name),
      stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, marketplace_subscribers.stripe_customer_id),
      stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, marketplace_subscribers.stripe_subscription_id),
      status = EXCLUDED.status,
      amount_cents = COALESCE(EXCLUDED.amount_cents, marketplace_subscribers.amount_cents),
      current_period_end = COALESCE(EXCLUDED.current_period_end, marketplace_subscribers.current_period_end),
      metadata = marketplace_subscribers.metadata || EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING id
  `;
  return rows[0]?.id as string | undefined;
}

export async function updateMarketplaceSubscriberStatus(
  stripeSubscriptionId: string,
  status: "active" | "past_due" | "canceled",
  canceledAt?: string | null
) {
  const db = getDb();
  await db`
    UPDATE marketplace_subscribers
    SET status = ${status},
        canceled_at = ${canceledAt || null},
        updated_at = NOW()
    WHERE stripe_subscription_id = ${stripeSubscriptionId}
  `;
}

export async function updateMarketplaceSubscriberPeriod(
  stripeSubscriptionId: string,
  currentPeriodEnd: string
) {
  const db = getDb();
  await db`
    UPDATE marketplace_subscribers
    SET current_period_end = ${currentPeriodEnd},
        status = 'active',
        updated_at = NOW()
    WHERE stripe_subscription_id = ${stripeSubscriptionId}
  `;
}

export async function getSubscribersByProject(projectId: string) {
  const db = getDb();
  return db`
    SELECT email, name, plan_name, status, amount_cents, currency,
           billing_interval, subscribed_at, canceled_at, current_period_end
    FROM marketplace_subscribers
    WHERE project_id = ${projectId}
    ORDER BY subscribed_at DESC
  `;
}

export async function getSubscriberSummary(projectId: string) {
  const db = getDb();
  const stats = await db`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('active', 'one_time')) AS active_count,
      COUNT(*) FILTER (WHERE status = 'canceled') AS canceled_count,
      COUNT(*) FILTER (WHERE subscribed_at > NOW() - INTERVAL '7 days') AS new_7d,
      COALESCE(SUM(amount_cents) FILTER (WHERE status = 'active' AND billing_interval = 'month'), 0) AS mrr_cents
    FROM marketplace_subscribers
    WHERE project_id = ${projectId}
  `;
  const recentRevenue = await db`
    SELECT COALESCE(SUM(gross_amount_cents), 0) AS revenue_7d_cents
    FROM revenue_transactions
    WHERE project_id = ${projectId} AND type = 'income' AND created_at > NOW() - INTERVAL '7 days'
  `;
  const s = stats[0] || {};
  return {
    activeCount: Number(s.active_count || 0),
    canceledCount: Number(s.canceled_count || 0),
    newLast7Days: Number(s.new_7d || 0),
    mrrCents: Number(s.mrr_cents || 0),
    revenueLast7DaysCents: Number(recentRevenue[0]?.revenue_7d_cents || 0),
    hasSubscribers: Number(s.active_count || 0) > 0,
  };
}

export async function getActivePricingPlansForProject(projectId: string): Promise<SyncedPricingPlan[]> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM project_pricing_plans
    WHERE project_id = ${projectId} AND active = TRUE
    ORDER BY sort_order ASC
  `;
  return rows.map((row) => toSyncedPlan(row as ProjectPricingPlanRow));
}
