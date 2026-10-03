import { getDb } from "@/lib/neon";

// ═══════════════════════════════════════════════════════════════════════════
// Affiliate / Referral Program
// ═══════════════════════════════════════════════════════════════════════════

export interface AffiliateProgram {
  projectId: string;
  enabled: boolean;
  commissionRate: number;
  cookieDurationDays: number;
  minPayoutCents: number;
  createdAt: string;
}

export interface Affiliate {
  id: string;
  projectId: string;
  name: string;
  email: string;
  code: string;
  totalClicks: number;
  totalConversions: number;
  totalCommissionCents: number;
  pendingCommissionCents: number;
  paidCommissionCents: number;
  status: "active" | "paused" | "banned";
  createdAt: string;
}

export interface AffiliateStats {
  totalAffiliates: number;
  activeAffiliates: number;
  totalClicks: number;
  totalConversions: number;
  totalCommissionCents: number;
  conversionRate: number;
}

export interface AffiliateProgramConfig {
  commissionRate: number;
  cookieDurationDays?: number;
  minPayoutCents?: number;
}

/**
 * Create or update affiliate program for a project.
 */
export async function createAffiliateProgram(
  projectId: string,
  config: AffiliateProgramConfig
): Promise<AffiliateProgram> {
  const db = getDb();

  const rows = await db`
    INSERT INTO affiliate_programs (project_id, commission_rate, cookie_duration_days, min_payout_cents, enabled)
    VALUES (
      ${projectId},
      ${config.commissionRate},
      ${config.cookieDurationDays || 30},
      ${config.minPayoutCents || 1000},
      true
    )
    ON CONFLICT (project_id) DO UPDATE SET
      commission_rate = EXCLUDED.commission_rate,
      cookie_duration_days = EXCLUDED.cookie_duration_days,
      min_payout_cents = EXCLUDED.min_payout_cents,
      enabled = true,
      updated_at = NOW()
    RETURNING *
  `;

  const row = rows[0];
  return {
    projectId: row.project_id as string,
    enabled: row.enabled as boolean,
    commissionRate: row.commission_rate as number,
    cookieDurationDays: row.cookie_duration_days as number,
    minPayoutCents: row.min_payout_cents as number,
    createdAt: row.created_at as string,
  };
}

/**
 * Generate a unique affiliate referral link.
 */
export async function generateAffiliateLink(
  projectId: string,
  affiliateId: string
): Promise<string> {
  const db = getDb();

  // Get the project slug for the URL
  const projects = await db`
    SELECT slug FROM projects WHERE id = ${projectId}
  `;
  if (projects.length === 0) throw new Error("Project not found");

  const affiliates = await db`
    SELECT code FROM affiliates WHERE id = ${affiliateId} AND project_id = ${projectId}
  `;
  if (affiliates.length === 0) throw new Error("Affiliate not found");

  const slug = projects[0].slug as string;
  const code = affiliates[0].code as string;

  return `https://${slug}.tryartha.com?ref=${code}`;
}

/**
 * Record an affiliate click.
 */
export async function trackClick(
  affiliateId: string,
  visitorId: string
): Promise<void> {
  const db = getDb();

  await db`
    INSERT INTO affiliate_clicks (affiliate_id, visitor_id)
    VALUES (${affiliateId}, ${visitorId})
  `;

  await db`
    UPDATE affiliates SET total_clicks = total_clicks + 1 WHERE id = ${affiliateId}
  `;
}

/**
 * Record an affiliate conversion and calculate commission.
 */
export async function trackConversion(
  affiliateId: string,
  amount: number
): Promise<{ commissionCents: number }> {
  const db = getDb();

  // Get the commission rate from the affiliate's project program
  const affiliates = await db`
    SELECT a.project_id, ap.commission_rate
    FROM affiliates a
    JOIN affiliate_programs ap ON ap.project_id = a.project_id
    WHERE a.id = ${affiliateId}
  `;
  if (affiliates.length === 0) throw new Error("Affiliate or program not found");

  const commissionRate = affiliates[0].commission_rate as number;
  const commissionCents = Math.round(amount * commissionRate);

  // Record conversion
  await db`
    INSERT INTO affiliate_conversions (affiliate_id, amount_cents, commission_cents)
    VALUES (${affiliateId}, ${amount}, ${commissionCents})
  `;

  // Update affiliate totals
  await db`
    UPDATE affiliates
    SET total_conversions = total_conversions + 1,
        total_commission_cents = total_commission_cents + ${commissionCents},
        pending_commission_cents = pending_commission_cents + ${commissionCents}
    WHERE id = ${affiliateId}
  `;

  return { commissionCents };
}

/**
 * Get aggregate affiliate stats for a project.
 */
export async function getAffiliateStats(
  projectId: string
): Promise<AffiliateStats> {
  const db = getDb();

  const rows = await db`
    SELECT
      COUNT(*) AS total_affiliates,
      COUNT(*) FILTER (WHERE status = 'active') AS active_affiliates,
      COALESCE(SUM(total_clicks), 0) AS total_clicks,
      COALESCE(SUM(total_conversions), 0) AS total_conversions,
      COALESCE(SUM(total_commission_cents), 0) AS total_commission_cents
    FROM affiliates
    WHERE project_id = ${projectId}
  `;

  const row = rows[0];
  const totalClicks = parseInt((row.total_clicks as string) || "0", 10);
  const totalConversions = parseInt((row.total_conversions as string) || "0", 10);

  return {
    totalAffiliates: parseInt((row.total_affiliates as string) || "0", 10),
    activeAffiliates: parseInt((row.active_affiliates as string) || "0", 10),
    totalClicks,
    totalConversions,
    totalCommissionCents: parseInt((row.total_commission_cents as string) || "0", 10),
    conversionRate: totalClicks > 0 ? Math.round((totalConversions / totalClicks) * 10000) / 100 : 0,
  };
}

/**
 * List all affiliates for a project.
 */
export async function listAffiliates(
  projectId: string
): Promise<Affiliate[]> {
  const db = getDb();

  const rows = await db`
    SELECT *
    FROM affiliates
    WHERE project_id = ${projectId}
    ORDER BY total_commission_cents DESC
  `;

  return rows.map((r) => ({
    id: r.id as string,
    projectId: r.project_id as string,
    name: r.name as string,
    email: r.email as string,
    code: r.code as string,
    totalClicks: parseInt((r.total_clicks as string) || "0", 10),
    totalConversions: parseInt((r.total_conversions as string) || "0", 10),
    totalCommissionCents: parseInt((r.total_commission_cents as string) || "0", 10),
    pendingCommissionCents: parseInt((r.pending_commission_cents as string) || "0", 10),
    paidCommissionCents: parseInt((r.paid_commission_cents as string) || "0", 10),
    status: r.status as "active" | "paused" | "banned",
    createdAt: r.created_at as string,
  }));
}
