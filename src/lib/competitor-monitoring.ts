import { getDb } from "@/lib/neon";

// ═══════════════════════════════════════════════════════════════════════════
// Competitor Monitoring — automated website diffing
// ═══════════════════════════════════════════════════════════════════════════

export interface CompetitorSnapshot {
  url: string;
  title: string;
  metaDescription: string;
  headings: string[];
  pricingSection: string | null;
  featuresSection: string | null;
  bodyText: string;
  fetchedAt: string;
}

export interface SnapshotDiff {
  url: string;
  changes: DiffChange[];
  hasSignificantChanges: boolean;
  summary: string;
}

export interface DiffChange {
  field: string;
  type: "added" | "removed" | "modified";
  oldValue?: string;
  newValue?: string;
}

/**
 * Fetch a competitor page and extract structured content.
 */
export async function takeSnapshot(competitorUrl: string): Promise<CompetitorSnapshot> {
  const response = await fetch(competitorUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ArthaBot/1.0)" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${competitorUrl}: ${response.status}`);
  }

  const html = await response.text();

  const title = extractBetween(html, "<title>", "</title>") || "";
  const metaDescription =
    extractMetaContent(html, "description") || "";

  const headings = extractAllMatches(html, /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi).map(
    stripHtml
  );

  const pricingSection = extractSection(html, /pric/i);
  const featuresSection = extractSection(html, /feature/i);

  const bodyText = stripHtml(
    extractBetween(html, "<body", "</body>") || html
  ).slice(0, 10_000);

  return {
    url: competitorUrl,
    title: stripHtml(title),
    metaDescription,
    headings,
    pricingSection,
    featuresSection,
    bodyText,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Compare two snapshots and return structured changes.
 */
export function compareSnapshots(
  oldSnap: CompetitorSnapshot,
  newSnap: CompetitorSnapshot
): SnapshotDiff {
  const changes: DiffChange[] = [];

  if (oldSnap.title !== newSnap.title) {
    changes.push({ field: "title", type: "modified", oldValue: oldSnap.title, newValue: newSnap.title });
  }
  if (oldSnap.metaDescription !== newSnap.metaDescription) {
    changes.push({ field: "metaDescription", type: "modified", oldValue: oldSnap.metaDescription, newValue: newSnap.metaDescription });
  }

  // Heading changes
  const oldHeadings = new Set(oldSnap.headings);
  const newHeadings = new Set(newSnap.headings);
  for (const h of newHeadings) {
    if (!oldHeadings.has(h)) {
      changes.push({ field: "headings", type: "added", newValue: h });
    }
  }
  for (const h of oldHeadings) {
    if (!newHeadings.has(h)) {
      changes.push({ field: "headings", type: "removed", oldValue: h });
    }
  }

  // Pricing section diff
  if (normalize(oldSnap.pricingSection) !== normalize(newSnap.pricingSection)) {
    if (!oldSnap.pricingSection && newSnap.pricingSection) {
      changes.push({ field: "pricingSection", type: "added", newValue: newSnap.pricingSection.slice(0, 500) });
    } else if (oldSnap.pricingSection && !newSnap.pricingSection) {
      changes.push({ field: "pricingSection", type: "removed", oldValue: oldSnap.pricingSection.slice(0, 500) });
    } else {
      changes.push({
        field: "pricingSection",
        type: "modified",
        oldValue: (oldSnap.pricingSection || "").slice(0, 500),
        newValue: (newSnap.pricingSection || "").slice(0, 500),
      });
    }
  }

  // Features section diff
  if (normalize(oldSnap.featuresSection) !== normalize(newSnap.featuresSection)) {
    if (!oldSnap.featuresSection && newSnap.featuresSection) {
      changes.push({ field: "featuresSection", type: "added", newValue: newSnap.featuresSection.slice(0, 500) });
    } else if (oldSnap.featuresSection && !newSnap.featuresSection) {
      changes.push({ field: "featuresSection", type: "removed", oldValue: oldSnap.featuresSection.slice(0, 500) });
    } else {
      changes.push({
        field: "featuresSection",
        type: "modified",
        oldValue: (oldSnap.featuresSection || "").slice(0, 500),
        newValue: (newSnap.featuresSection || "").slice(0, 500),
      });
    }
  }

  // Body text similarity check (simple word-level diff ratio)
  const oldWords = normalize(oldSnap.bodyText).split(/\s+/);
  const newWords = normalize(newSnap.bodyText).split(/\s+/);
  const oldWordSet = new Set(oldWords);
  const newWordSet = new Set(newWords);
  const commonWords = oldWords.filter((w) => newWordSet.has(w)).length;
  const similarity = oldWords.length > 0 ? commonWords / Math.max(oldWords.length, newWords.length) : 1;

  if (similarity < 0.85) {
    changes.push({ field: "bodyText", type: "modified", oldValue: `~${oldWordSet.size} unique words`, newValue: `~${newWordSet.size} unique words (${Math.round(similarity * 100)}% similar)` });
  }

  const hasSignificantChanges = changes.some(
    (c) => c.field === "pricingSection" || c.field === "featuresSection" || c.field === "title"
  ) || changes.length >= 3;

  const summary = changes.length === 0
    ? "No changes detected."
    : `${changes.length} change(s) detected: ${changes.map((c) => `${c.field} (${c.type})`).join(", ")}`;

  return { url: oldSnap.url, changes, hasSignificantChanges, summary };
}

/**
 * Get stored competitor snapshots for a project.
 */
export async function getCompetitorSnapshots(
  projectId: string,
  url?: string
): Promise<Array<{ id: string; url: string; snapshot: CompetitorSnapshot; created_at: string }>> {
  const db = getDb();

  if (url) {
    const rows = await db`
      SELECT id, metadata->>'url' AS url, content::jsonb AS snapshot, created_at
      FROM documents
      WHERE project_id = ${projectId}
        AND type = 'competitor_snapshot'
        AND metadata->>'url' = ${url}
      ORDER BY created_at DESC
      LIMIT 10
    `;
    return rows.map(parseSnapshotRow);
  }

  const rows = await db`
    SELECT id, metadata->>'url' AS url, content::jsonb AS snapshot, created_at
    FROM documents
    WHERE project_id = ${projectId}
      AND type = 'competitor_snapshot'
    ORDER BY created_at DESC
    LIMIT 50
  `;
  return rows.map(parseSnapshotRow);
}

/**
 * Store a snapshot in the documents table.
 */
export async function storeSnapshot(
  projectId: string,
  url: string,
  snapshot: CompetitorSnapshot
): Promise<string> {
  const db = getDb();
  const rows = await db`
    INSERT INTO documents (project_id, type, title, content, metadata)
    VALUES (
      ${projectId},
      'competitor_snapshot',
      ${`Snapshot: ${snapshot.title || url}`},
      ${JSON.stringify(snapshot)},
      ${JSON.stringify({ url, fetchedAt: snapshot.fetchedAt })}
    )
    RETURNING id
  `;
  return rows[0].id as string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function parseSnapshotRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    url: row.url as string,
    snapshot: (typeof row.snapshot === "string" ? JSON.parse(row.snapshot) : row.snapshot) as CompetitorSnapshot,
    created_at: row.created_at as string,
  };
}

function extractBetween(html: string, start: string, end: string): string | null {
  const startIdx = html.toLowerCase().indexOf(start.toLowerCase());
  if (startIdx === -1) return null;
  const contentStart = html.indexOf(">", startIdx) + 1;
  const endIdx = html.toLowerCase().indexOf(end.toLowerCase(), contentStart);
  if (endIdx === -1) return null;
  return html.slice(contentStart, endIdx);
}

function extractMetaContent(html: string, name: string): string | null {
  const regex = new RegExp(
    `<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["']`,
    "i"
  );
  const match = html.match(regex);
  if (match) return match[1];
  // Try reversed attribute order
  const regex2 = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${name}["']`,
    "i"
  );
  const match2 = html.match(regex2);
  return match2 ? match2[1] : null;
}

function extractAllMatches(html: string, regex: RegExp): string[] {
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    if (m[1]) matches.push(m[1]);
  }
  return matches;
}

function extractSection(html: string, sectionPattern: RegExp): string | null {
  // Find a section/div with an id or class matching the pattern
  const sectionRegex = new RegExp(
    `<(?:section|div)[^>]*(?:id|class)=["'][^"']*${sectionPattern.source}[^"']*["'][^>]*>([\\s\\S]*?)<\\/(?:section|div)>`,
    "i"
  );
  const match = html.match(sectionRegex);
  return match ? stripHtml(match[1]).slice(0, 2000) : null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(text: string | null): string {
  return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
}
