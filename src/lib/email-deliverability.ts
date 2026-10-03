import { getDb } from "@/lib/neon";

// ═══════════════════════════════════════════════════════════════════════════
// Email Deliverability Metrics
// ═══════════════════════════════════════════════════════════════════════════

export type EmailEventType =
  | "sent"
  | "delivered"
  | "bounced"
  | "spam_complaint"
  | "opened"
  | "clicked";

export interface DeliverabilityMetrics {
  sent: number;
  delivered: number;
  bounced: number;
  spam: number;
  opens: number;
  clicks: number;
  inbox_rate: number; // 0-100
  bounce_rate: number;
  spam_rate: number;
  open_rate: number;
  click_rate: number;
}

export interface DomainHealth {
  spf: "pass" | "fail" | "unknown";
  dkim: "pass" | "fail" | "unknown";
  dmarc: "pass" | "fail" | "unknown";
  overall: "healthy" | "warning" | "critical";
}

/**
 * Record an email event (sent, delivered, bounced, etc.) for a project.
 * Upserts a daily counter row in `email_deliverability`.
 */
export async function recordEmailEvent(
  projectId: string,
  eventType: EmailEventType,
  date?: Date
): Promise<void> {
  const db = getDb();
  const eventDate = (date ?? new Date()).toISOString().split("T")[0];

  // Ensure the row exists first
  await db`
    INSERT INTO email_deliverability (project_id, date)
    VALUES (${projectId}, ${eventDate}::date)
    ON CONFLICT DO NOTHING
  `;

  // Static column updates — neon tagged templates don't support dynamic column names
  switch (eventType) {
    case "sent":
      await db`UPDATE email_deliverability SET sent = sent + 1 WHERE project_id = ${projectId} AND date = ${eventDate}::date`;
      break;
    case "delivered":
      await db`UPDATE email_deliverability SET delivered = delivered + 1 WHERE project_id = ${projectId} AND date = ${eventDate}::date`;
      break;
    case "bounced":
      await db`UPDATE email_deliverability SET bounced = bounced + 1 WHERE project_id = ${projectId} AND date = ${eventDate}::date`;
      break;
    case "spam_complaint":
      await db`UPDATE email_deliverability SET spam_complaints = spam_complaints + 1 WHERE project_id = ${projectId} AND date = ${eventDate}::date`;
      break;
    case "opened":
      await db`UPDATE email_deliverability SET opens = opens + 1 WHERE project_id = ${projectId} AND date = ${eventDate}::date`;
      break;
    case "clicked":
      await db`UPDATE email_deliverability SET clicks = clicks + 1 WHERE project_id = ${projectId} AND date = ${eventDate}::date`;
      break;
  }
}

/**
 * Returns aggregate deliverability metrics over the last N days.
 */
export async function getDeliverabilityMetrics(
  projectId: string,
  days: number = 30
): Promise<DeliverabilityMetrics> {
  const db = getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const rows = await db`
    SELECT
      COALESCE(SUM(sent), 0)::int AS sent,
      COALESCE(SUM(delivered), 0)::int AS delivered,
      COALESCE(SUM(bounced), 0)::int AS bounced,
      COALESCE(SUM(spam_complaints), 0)::int AS spam,
      COALESCE(SUM(opens), 0)::int AS opens,
      COALESCE(SUM(clicks), 0)::int AS clicks
    FROM email_deliverability
    WHERE project_id = ${projectId} AND date >= ${since}
  `;

  const r = rows[0];
  const sent = Number(r.sent) || 0;
  const delivered = Number(r.delivered) || 0;
  const bounced = Number(r.bounced) || 0;
  const spam = Number(r.spam) || 0;
  const opens = Number(r.opens) || 0;
  const clicks = Number(r.clicks) || 0;

  return {
    sent,
    delivered,
    bounced,
    spam,
    opens,
    clicks,
    inbox_rate: sent > 0 ? Math.round((delivered / sent) * 100) : 0,
    bounce_rate: sent > 0 ? Math.round((bounced / sent) * 100) : 0,
    spam_rate: sent > 0 ? Math.round((spam / sent) * 100) : 0,
    open_rate: delivered > 0 ? Math.round((opens / delivered) * 100) : 0,
    click_rate: delivered > 0 ? Math.round((clicks / delivered) * 100) : 0,
  };
}

/**
 * Returns SPF/DKIM/DMARC status for the project's email domain.
 * Reads from the projects table email domain verification info.
 */
export async function getDomainHealth(projectId: string): Promise<DomainHealth> {
  const db = getDb();
  const rows = await db`
    SELECT
      custom_email_domain,
      email_domain_verified,
      email_setup_status
    FROM projects
    WHERE id = ${projectId}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return { spf: "unknown", dkim: "unknown", dmarc: "unknown", overall: "critical" };
  }

  const project = rows[0];
  const hasCustomDomain = !!project.custom_email_domain;
  const isVerified = !!project.email_domain_verified;
  const emailConfigured = project.email_setup_status === "configured";

  // If no custom domain, use platform defaults (always pass)
  if (!hasCustomDomain) {
    return {
      spf: emailConfigured ? "pass" : "unknown",
      dkim: emailConfigured ? "pass" : "unknown",
      dmarc: emailConfigured ? "pass" : "unknown",
      overall: emailConfigured ? "healthy" : "warning",
    };
  }

  // Custom domain: check verification status
  const spf: DomainHealth["spf"] = isVerified ? "pass" : "fail";
  const dkim: DomainHealth["dkim"] = isVerified ? "pass" : "fail";
  const dmarc: DomainHealth["dmarc"] = isVerified ? "pass" : "fail";

  let overall: DomainHealth["overall"] = "healthy";
  const statuses: string[] = [spf, dkim, dmarc];
  if (statuses.some((s) => s === "fail")) overall = "critical";
  else if (statuses.some((s) => s === "unknown")) overall = "warning";

  return { spf, dkim, dmarc, overall };
}

