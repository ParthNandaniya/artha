import { getDb } from "@/lib/neon";
import { searchWeb } from "@/lib/search";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface LeadSearchFilters {
  status?: string;
  minScore?: number;
  maxScore?: number;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  contacted?: boolean;
  q?: string;
  page?: number;
  limit?: number;
}

export interface LeadEnrichmentData {
  company?: string;
  role?: string;
  phone?: string;
  website?: string;
  linkedin_url?: string;
  notes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface LeadSearchResult {
  leads: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Search leads with filters
// ═══════════════════════════════════════════════════════════════════════════

export async function searchLeads(
  projectId: string,
  filters: LeadSearchFilters
): Promise<LeadSearchResult> {
  const db = getDb();
  const page = filters.page ?? 1;
  const limit = Math.min(filters.limit ?? 25, 100);
  const offset = (page - 1) * limit;

  // Build WHERE conditions dynamically
  const conditions: string[] = ["project_id = $1"];
  const params: unknown[] = [projectId];
  let paramIdx = 2;

  if (filters.status) {
    conditions.push(`status = $${paramIdx}`);
    params.push(filters.status);
    paramIdx++;
  }

  if (filters.minScore !== undefined) {
    conditions.push(`score >= $${paramIdx}`);
    params.push(filters.minScore);
    paramIdx++;
  }

  if (filters.maxScore !== undefined) {
    conditions.push(`score <= $${paramIdx}`);
    params.push(filters.maxScore);
    paramIdx++;
  }

  if (filters.contacted !== undefined) {
    conditions.push(`contacted = $${paramIdx}`);
    params.push(filters.contacted);
    paramIdx++;
  }

  if (filters.dateFrom) {
    conditions.push(`created_at >= $${paramIdx}`);
    params.push(filters.dateFrom);
    paramIdx++;
  }

  if (filters.dateTo) {
    conditions.push(`created_at <= $${paramIdx}`);
    params.push(filters.dateTo);
    paramIdx++;
  }

  if (filters.q) {
    conditions.push(
      `(name ILIKE $${paramIdx} OR email ILIKE $${paramIdx} OR company ILIKE $${paramIdx})`
    );
    params.push(`%${filters.q}%`);
    paramIdx++;
  }

  if (filters.tags && filters.tags.length > 0) {
    conditions.push(`tags && $${paramIdx}`);
    params.push(filters.tags);
    paramIdx++;
  }

  const where = conditions.join(" AND ");

  // Use tagged template for count and data queries via Neon
  // Since Neon's tagged template doesn't support dynamic WHERE easily,
  // we build the query parts and use the sql client
  const countRows = await db`
    SELECT COUNT(*)::int AS total
    FROM leads
    WHERE project_id = ${projectId}
      ${filters.status ? db`AND status = ${filters.status}` : db``}
      ${filters.minScore !== undefined ? db`AND score >= ${filters.minScore}` : db``}
      ${filters.maxScore !== undefined ? db`AND score <= ${filters.maxScore}` : db``}
      ${filters.contacted !== undefined ? db`AND contacted = ${filters.contacted}` : db``}
      ${filters.dateFrom ? db`AND created_at >= ${filters.dateFrom}` : db``}
      ${filters.dateTo ? db`AND created_at <= ${filters.dateTo}` : db``}
      ${filters.q ? db`AND (name ILIKE ${`%${filters.q}%`} OR email ILIKE ${`%${filters.q}%`} OR company ILIKE ${`%${filters.q}%`})` : db``}
      ${filters.tags && filters.tags.length > 0 ? db`AND tags && ${filters.tags}` : db``}
  `;

  const leads = await db`
    SELECT *
    FROM leads
    WHERE project_id = ${projectId}
      ${filters.status ? db`AND status = ${filters.status}` : db``}
      ${filters.minScore !== undefined ? db`AND score >= ${filters.minScore}` : db``}
      ${filters.maxScore !== undefined ? db`AND score <= ${filters.maxScore}` : db``}
      ${filters.contacted !== undefined ? db`AND contacted = ${filters.contacted}` : db``}
      ${filters.dateFrom ? db`AND created_at >= ${filters.dateFrom}` : db``}
      ${filters.dateTo ? db`AND created_at <= ${filters.dateTo}` : db``}
      ${filters.q ? db`AND (name ILIKE ${`%${filters.q}%`} OR email ILIKE ${`%${filters.q}%`} OR company ILIKE ${`%${filters.q}%`})` : db``}
      ${filters.tags && filters.tags.length > 0 ? db`AND tags && ${filters.tags}` : db``}
    ORDER BY score DESC, created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return {
    leads,
    total: countRows[0]?.total ?? 0,
    page,
    limit,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Enrich a single lead with provided data
// ═══════════════════════════════════════════════════════════════════════════

export async function enrichLead(
  leadId: string,
  enrichmentData: LeadEnrichmentData
): Promise<void> {
  const db = getDb();

  await db`
    UPDATE leads SET
      company   = COALESCE(${enrichmentData.company ?? null}, company),
      role      = COALESCE(${enrichmentData.role ?? null}, role),
      phone     = COALESCE(${enrichmentData.phone ?? null}, phone),
      website   = COALESCE(${enrichmentData.website ?? null}, website),
      linkedin_url = COALESCE(${enrichmentData.linkedin_url ?? null}, linkedin_url),
      notes     = COALESCE(${enrichmentData.notes ?? null}, notes),
      tags      = COALESCE(${enrichmentData.tags ?? null}, tags),
      metadata  = COALESCE(
        CASE WHEN ${enrichmentData.metadata ? JSON.stringify(enrichmentData.metadata) : null}::jsonb IS NOT NULL
          THEN metadata || ${enrichmentData.metadata ? JSON.stringify(enrichmentData.metadata) : '{}'}::jsonb
          ELSE metadata
        END,
        metadata
      ),
      updated_at = NOW()
    WHERE id = ${leadId}
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
// Bulk enrich leads using Exa web search
// ═══════════════════════════════════════════════════════════════════════════

export async function bulkEnrichLeads(
  projectId: string,
  leadIds: string[]
): Promise<{ enriched: number; failed: number }> {
  const db = getDb();
  let enriched = 0;
  let failed = 0;

  // Fetch the leads to enrich
  const leads = await db`
    SELECT id, name, email, company, website
    FROM leads
    WHERE project_id = ${projectId} AND id = ANY(${leadIds})
  `;

  for (const lead of leads) {
    try {
      const name = lead.name as string | null;
      const email = lead.email as string | null;
      const company = lead.company as string | null;

      if (!name && !email && !company) {
        failed++;
        continue;
      }

      // Build a search query from available lead info
      const queryParts: string[] = [];
      if (name) queryParts.push(name);
      if (company) queryParts.push(company);
      if (!company && email) {
        const domain = email.split("@")[1];
        if (domain) queryParts.push(domain);
      }

      const query = queryParts.join(" ") + " professional profile";
      const response = await searchWeb(query, {
        engine: "exa",
        maxResults: 3,
      });

      if (response.results.length > 0) {
        const topResult = response.results[0];
        const enrichmentData: LeadEnrichmentData = {
          metadata: {
            enrichment_source: "exa",
            enrichment_date: new Date().toISOString(),
            enrichment_results: response.results.map((r) => ({
              title: r.title,
              url: r.url,
              snippet: r.content.slice(0, 300),
            })),
          },
        };

        // Try to extract company info from results if missing
        if (!lead.company && topResult.content) {
          const companyMatch = topResult.content.match(
            /(?:at|@|works?\s+(?:for|at))\s+([A-Z][A-Za-z0-9\s&.]+)/
          );
          if (companyMatch) {
            enrichmentData.company = companyMatch[1].trim();
          }
        }

        // Try to extract website if missing
        if (!lead.website && topResult.url) {
          const url = new URL(topResult.url);
          if (!url.hostname.includes("linkedin") && !url.hostname.includes("twitter")) {
            enrichmentData.website = url.origin;
          }
        }

        // Try to find LinkedIn URL
        const linkedinResult = response.results.find((r) =>
          r.url.includes("linkedin.com/in/")
        );
        if (linkedinResult) {
          enrichmentData.linkedin_url = linkedinResult.url;
        }

        await enrichLead(lead.id as string, enrichmentData);
        enriched++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { enriched, failed };
}

// ═══════════════════════════════════════════════════════════════════════════
// Upsert leads with deduplication
// ═══════════════════════════════════════════════════════════════════════════

export interface UpsertLead {
  name: string;
  email?: string | null;
  linkedin_url?: string | null;
  company: string;
  role?: string | null;
  phone?: string | null;
  website?: string | null;
  source?: string;
  source_research_id?: string | null;
  score: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  why?: string;
}

export interface UpsertResult {
  inserted: number;
  updated: number;
  leads: Record<string, unknown>[];
}

/**
 * Insert leads with deduplication. Matches on (email) or (name + company).
 * If a duplicate is found:
 * - Updates score if the new score is higher
 * - Merges tags (union)
 * - Merges metadata (shallow merge, new values take precedence)
 * - Does NOT overwrite existing contact info (email, phone, linkedin) if already set
 */
export async function upsertLeads(
  projectId: string,
  leads: UpsertLead[],
): Promise<UpsertResult> {
  const db = getDb();
  let inserted = 0;
  let updated = 0;
  const resultLeads: Record<string, unknown>[] = [];

  for (const lead of leads) {
    // Check for existing lead: match on email (if available) or name+company
    const existing = await db`
      SELECT id, score, tags, metadata
      FROM leads
      WHERE project_id = ${projectId}
        AND (
          ${lead.email ? db`(LOWER(email) = LOWER(${lead.email}) AND email IS NOT NULL)` : db`FALSE`}
          OR (LOWER(name) = LOWER(${lead.name}) AND LOWER(company) = LOWER(${lead.company}))
        )
      LIMIT 1
    `;

    if (existing.length > 0) {
      // Duplicate found — merge
      const ex = existing[0];
      const existingTags = (ex.tags as string[]) || [];
      const newTags = lead.tags || [];
      const mergedTags = [...new Set([...existingTags, ...newTags])];
      const existingMeta = (ex.metadata as Record<string, unknown>) || {};
      const mergedMeta = { ...existingMeta, ...(lead.metadata || {}) };
      const betterScore = Math.max(ex.score as number, lead.score);

      const rows = await db`
        UPDATE leads SET
          score = ${betterScore},
          tags = ${mergedTags},
          metadata = ${JSON.stringify(mergedMeta)}::jsonb,
          role = COALESCE(role, ${lead.role ?? null}),
          phone = COALESCE(phone, ${lead.phone ?? null}),
          website = COALESCE(website, ${lead.website ?? null}),
          linkedin_url = COALESCE(linkedin_url, ${lead.linkedin_url ?? null}),
          updated_at = NOW()
        WHERE id = ${ex.id}
        RETURNING *
      `;
      updated++;
      if (rows[0]) resultLeads.push(rows[0]);
    } else {
      // New lead — insert
      const rows = await db`
        INSERT INTO leads (
          id, project_id, name, email, linkedin_url, company, role,
          phone, website, source, source_research_id, score, tags, metadata,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${projectId}, ${lead.name}, ${lead.email ?? null},
          ${lead.linkedin_url ?? null}, ${lead.company}, ${lead.role ?? null},
          ${lead.phone ?? null}, ${lead.website ?? null}, ${lead.source ?? "lead_finder"},
          ${lead.source_research_id ?? null}, ${lead.score}, ${lead.tags || []},
          ${JSON.stringify(lead.metadata || {})}::jsonb, NOW(), NOW()
        )
        RETURNING *
      `;
      inserted++;
      if (rows[0]) resultLeads.push(rows[0]);
    }
  }

  return { inserted, updated, leads: resultLeads };
}
