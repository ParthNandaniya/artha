import { getDb } from "@/lib/neon";

// ═══════════════════════════════════════════════════════════════════════════
// Subscription Analytics — SaaS metrics (MRR, churn, LTV, ARPU)
// ═══════════════════════════════════════════════════════════════════════════

export interface SubscriptionMetrics {
  mrr: number;
  churnRate: number;
  ltv: number;
  arpu: number;
  subscriberCount: number;
  activeSubscribers: number;
  canceledSubscribers: number;
}

export interface MrrDataPoint {
  month: string;
  mrr: number;
  newMrr: number;
  churnedMrr: number;
  netNewMrr: number;
}

export interface ChurnDataPoint {
  month: string;
  churnRate: number;
  churned: number;
  total: number;
}

/**
 * Get current subscription metrics for a project.
 */
export async function getSubscriptionMetrics(
  projectId: string
): Promise<SubscriptionMetrics> {
  const db = getDb();

  const [subscriberRows, revenueRows] = await Promise.all([
    db`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') AS active_count,
        COUNT(*) FILTER (WHERE status = 'canceled') AS canceled_count,
        COUNT(*) AS total_count
      FROM marketplace_subscribers
      WHERE project_id = ${projectId}
    `,
    db`
      SELECT
        COALESCE(SUM(amount_cents) FILTER (WHERE status = 'completed' AND type = 'income'), 0) AS total_revenue,
        COUNT(DISTINCT subscriber_id) FILTER (WHERE status = 'completed' AND type = 'income') AS paying_count
      FROM revenue_transactions
      WHERE project_id = ${projectId}
    `,
  ]);

  const activeSubscribers = parseInt((subscriberRows[0]?.active_count as string) || "0", 10);
  const canceledSubscribers = parseInt((subscriberRows[0]?.canceled_count as string) || "0", 10);
  const subscriberCount = parseInt((subscriberRows[0]?.total_count as string) || "0", 10);
  const totalRevenue = parseInt((revenueRows[0]?.total_revenue as string) || "0", 10);

  // Calculate MRR from active subscribers with recurring plans
  const mrrRows = await db`
    SELECT COALESCE(SUM(ms.amount_cents), 0) AS mrr
    FROM marketplace_subscribers ms
    JOIN project_pricing_plans pp ON pp.id = ms.plan_id
    WHERE ms.project_id = ${projectId}
      AND ms.status = 'active'
      AND pp.billing_interval != 'one_time'
  `;
  const mrr = parseInt((mrrRows[0]?.mrr as string) || "0", 10);

  // Churn rate: canceled in last 30 days / total at start of period
  const churnRows = await db`
    SELECT COUNT(*) AS churned
    FROM marketplace_subscribers
    WHERE project_id = ${projectId}
      AND status = 'canceled'
      AND canceled_at >= NOW() - INTERVAL '30 days'
  `;
  const churned = parseInt((churnRows[0]?.churned as string) || "0", 10);
  const startTotal = activeSubscribers + churned;
  const churnRate = startTotal > 0 ? (churned / startTotal) * 100 : 0;

  // LTV = ARPU / monthly churn rate
  const arpu = activeSubscribers > 0 ? mrr / activeSubscribers : 0;
  const monthlyChurnDecimal = churnRate / 100;
  const ltv = monthlyChurnDecimal > 0 ? arpu / monthlyChurnDecimal : arpu * 24; // default 24 months if no churn

  return {
    mrr,
    churnRate: Math.round(churnRate * 100) / 100,
    ltv: Math.round(ltv),
    arpu: Math.round(arpu),
    subscriberCount,
    activeSubscribers,
    canceledSubscribers,
  };
}

/**
 * Get monthly MRR history.
 */
export async function getMrrHistory(
  projectId: string,
  months = 12
): Promise<MrrDataPoint[]> {
  const db = getDb();

  const rows = await db`
    WITH months AS (
      SELECT generate_series(
        DATE_TRUNC('month', NOW()) - ${(months - 1) + " months"}::interval,
        DATE_TRUNC('month', NOW()),
        '1 month'::interval
      ) AS month
    ),
    monthly_revenue AS (
      SELECT
        DATE_TRUNC('month', rt.created_at) AS month,
        SUM(rt.amount_cents) FILTER (WHERE rt.type = 'income') AS revenue,
        SUM(rt.amount_cents) FILTER (
          WHERE rt.type = 'income'
          AND ms.subscribed_at >= DATE_TRUNC('month', rt.created_at)
          AND ms.subscribed_at < DATE_TRUNC('month', rt.created_at) + INTERVAL '1 month'
        ) AS new_revenue
      FROM revenue_transactions rt
      LEFT JOIN marketplace_subscribers ms ON ms.id = rt.subscriber_id
      WHERE rt.project_id = ${projectId} AND rt.status = 'completed'
      GROUP BY DATE_TRUNC('month', rt.created_at)
    ),
    monthly_churn AS (
      SELECT
        DATE_TRUNC('month', canceled_at) AS month,
        SUM(amount_cents) AS churned_revenue
      FROM marketplace_subscribers
      WHERE project_id = ${projectId} AND canceled_at IS NOT NULL
      GROUP BY DATE_TRUNC('month', canceled_at)
    )
    SELECT
      TO_CHAR(m.month, 'YYYY-MM') AS month,
      COALESCE(mr.revenue, 0) AS mrr,
      COALESCE(mr.new_revenue, 0) AS new_mrr,
      COALESCE(mc.churned_revenue, 0) AS churned_mrr
    FROM months m
    LEFT JOIN monthly_revenue mr ON mr.month = m.month
    LEFT JOIN monthly_churn mc ON mc.month = m.month
    ORDER BY m.month
  `;

  return rows.map((r) => ({
    month: r.month as string,
    mrr: parseInt((r.mrr as string) || "0", 10),
    newMrr: parseInt((r.new_mrr as string) || "0", 10),
    churnedMrr: parseInt((r.churned_mrr as string) || "0", 10),
    netNewMrr:
      parseInt((r.new_mrr as string) || "0", 10) -
      parseInt((r.churned_mrr as string) || "0", 10),
  }));
}

/**
 * Get monthly churn rate history.
 */
export async function getChurnHistory(
  projectId: string,
  months = 12
): Promise<ChurnDataPoint[]> {
  const db = getDb();

  const rows = await db`
    WITH months AS (
      SELECT generate_series(
        DATE_TRUNC('month', NOW()) - ${(months - 1) + " months"}::interval,
        DATE_TRUNC('month', NOW()),
        '1 month'::interval
      ) AS month
    ),
    monthly_stats AS (
      SELECT
        DATE_TRUNC('month', subscribed_at) AS month,
        COUNT(*) AS subscribed
      FROM marketplace_subscribers
      WHERE project_id = ${projectId}
      GROUP BY DATE_TRUNC('month', subscribed_at)
    ),
    monthly_churn AS (
      SELECT
        DATE_TRUNC('month', canceled_at) AS month,
        COUNT(*) AS churned
      FROM marketplace_subscribers
      WHERE project_id = ${projectId} AND canceled_at IS NOT NULL
      GROUP BY DATE_TRUNC('month', canceled_at)
    )
    SELECT
      TO_CHAR(m.month, 'YYYY-MM') AS month,
      COALESCE(mc.churned, 0) AS churned,
      GREATEST(COALESCE(SUM(ms.subscribed) OVER (ORDER BY m.month), 0) - COALESCE(SUM(mc2.churned) OVER (ORDER BY m.month), 0), 1) AS total
    FROM months m
    LEFT JOIN monthly_stats ms ON ms.month = m.month
    LEFT JOIN monthly_churn mc ON mc.month = m.month
    LEFT JOIN monthly_churn mc2 ON mc2.month <= m.month
    GROUP BY m.month, mc.churned
    ORDER BY m.month
  `;

  return rows.map((r) => {
    const churned = parseInt((r.churned as string) || "0", 10);
    const total = Math.max(parseInt((r.total as string) || "1", 10), 1);
    return {
      month: r.month as string,
      churnRate: Math.round((churned / total) * 10000) / 100,
      churned,
      total,
    };
  });
}
