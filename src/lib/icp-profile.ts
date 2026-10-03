/**
 * ICP (Ideal Customer Profile) Learning Loop.
 *
 * Derives an evolving customer profile from the leads table by analyzing
 * which leads the user has contacted, replied to, or converted. This
 * context is injected into the lead finder system prompt so future
 * searches progressively improve.
 */

import { getDb } from "@/lib/neon";

// ── Types ────────────────────────────────────────────────────────────

export interface ICPProfile {
  /** Most common roles among high-value leads */
  preferredRoles: string[];
  /** Most common company types/industries */
  preferredCompanyTypes: string[];
  /** Most common tags among contacted/converted leads */
  commonTags: string[];
  /** Average score of contacted leads */
  avgContactedScore: number;
  /** Sample high-fit leads for few-shot context */
  sampleLeads: { name: string; company: string; role?: string; score: number }[];
  /** Total leads in the database for this project */
  totalLeads: number;
  /** Number of contacted leads (signal strength indicator) */
  contactedCount: number;
}

// ── Profile Builder ──────────────────────────────────────────────────

/**
 * Build an ICP profile from the project's lead history.
 * Returns null if there's insufficient data (< 3 contacted leads).
 */
export async function getICPProfile(projectId: string): Promise<ICPProfile | null> {
  const db = getDb();

  // Get contacted/converted leads (positive signals from user behavior)
  const contactedLeads = await db`
    SELECT name, company, role, score, tags, metadata
    FROM leads
    WHERE project_id = ${projectId}
      AND (contacted = TRUE OR status IN ('contacted', 'replied', 'qualified', 'converted'))
    ORDER BY score DESC
    LIMIT 30
  `;

  // Need at least 3 contacted leads for meaningful ICP
  if (contactedLeads.length < 3) return null;

  // Also get high-score leads (even if not contacted yet)
  const topLeads = await db`
    SELECT name, company, role, score, tags
    FROM leads
    WHERE project_id = ${projectId} AND score >= 60
    ORDER BY score DESC
    LIMIT 20
  `;

  // Get total count
  const countResult = await db`
    SELECT COUNT(*)::int AS total FROM leads WHERE project_id = ${projectId}
  `;

  // Extract common patterns
  const preferredRoles = extractCommonValues(
    contactedLeads.map((l) => l.role as string).filter(Boolean),
  );

  const preferredCompanyTypes = extractCommonValues(
    contactedLeads.map((l) => l.company as string).filter(Boolean),
  );

  const allTags = contactedLeads.flatMap((l) => (l.tags as string[]) || []);
  const commonTags = extractCommonValues(allTags);

  const scores = contactedLeads.map((l) => l.score as number);
  const avgContactedScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  const sampleLeads = contactedLeads.slice(0, 5).map((l) => ({
    name: l.name as string,
    company: l.company as string,
    role: l.role as string | undefined,
    score: l.score as number,
  }));

  return {
    preferredRoles,
    preferredCompanyTypes,
    commonTags,
    avgContactedScore,
    sampleLeads,
    totalLeads: countResult[0]?.total ?? 0,
    contactedCount: contactedLeads.length,
  };
}

// ── Context Builder ──────────────────────────────────────────────────

/**
 * Build a context string from the ICP profile for injection into the
 * lead finder system prompt. Returns empty string if no profile.
 */
export async function buildICPContext(projectId: string): Promise<string> {
  const profile = await getICPProfile(projectId);
  if (!profile) return "";

  const lines = [
    `\nIDEAL CUSTOMER PROFILE (learned from ${profile.contactedCount} contacted leads out of ${profile.totalLeads} total):`,
  ];

  if (profile.preferredRoles.length > 0) {
    lines.push(`- Preferred roles: ${profile.preferredRoles.join(", ")}`);
  }
  if (profile.preferredCompanyTypes.length > 0) {
    lines.push(`- Preferred company types: ${profile.preferredCompanyTypes.join(", ")}`);
  }
  if (profile.commonTags.length > 0) {
    lines.push(`- Common signals: ${profile.commonTags.join(", ")}`);
  }
  if (profile.avgContactedScore > 0) {
    lines.push(`- Average score of contacted leads: ${profile.avgContactedScore}/100`);
  }
  if (profile.sampleLeads.length > 0) {
    lines.push(`- Example high-fit leads: ${profile.sampleLeads.map((l) => `${l.name} at ${l.company}${l.role ? ` (${l.role})` : ""}`).join("; ")}`);
  }
  lines.push(`\nPrioritize leads that match this ICP pattern. Leads similar to previously contacted ones are more likely to convert.`);

  return lines.join("\n");
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Extract the most common values from an array, returning top N.
 */
function extractCommonValues(values: string[], topN = 5): string[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const normalized = v.trim().toLowerCase();
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([value]) => value);
}
