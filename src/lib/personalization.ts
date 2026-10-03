import { getDb } from "./neon";

const MAX_SIGNALS = 12;
const MAX_LIST_ITEMS = 6;

type JsonMap = Record<string, unknown>;

function asRecord(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonMap
    : {};
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function asStringArray(value: unknown, limit: number = MAX_LIST_ITEMS): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function uniqueStrings(items: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item.trim().replace(/\s+/g, " ").toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(item.trim().replace(/\s+/g, " "));
    if (result.length >= limit) break;
  }

  return result;
}

function compactText(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;

  const sentenceBoundary = normalized.lastIndexOf(". ", maxChars);
  const cutIndex = sentenceBoundary > Math.floor(maxChars * 0.6)
    ? sentenceBoundary + 1
    : normalized.lastIndexOf(" ", maxChars);

  return `${normalized.slice(0, cutIndex > 0 ? cutIndex : maxChars).trim()}...`;
}

function extractFirstParagraph(content: string, maxChars: number = 320): string | undefined {
  const paragraph = content
    .replace(/[#>*`_-]/g, " ")
    .split(/\n\s*\n/)
    .map((part) => compactText(part, maxChars))
    .find(Boolean);

  return paragraph ? compactText(paragraph, maxChars) : undefined;
}

function formatSection(label: string, value?: string): string | null {
  return value ? `${label}: ${value}` : null;
}

function formatList(label: string, items: string[]): string | null {
  return items.length > 0 ? `${label}: ${items.join(", ")}` : null;
}

export function buildFounderResearchSummary(user: {
  name?: string | null;
  email?: string | null;
  googleData?: JsonMap;
}): string {
  const googleData = asRecord(user.googleData);
  const research = asRecord(googleData.research);
  const fitSignals = uniqueStrings([
    ...asStringArray(research.fitSignals),
    ...asStringArray(research.fit_signals),
  ], MAX_LIST_ITEMS);
  const riskSignals = uniqueStrings([
    ...asStringArray(research.riskSignals),
    ...asStringArray(research.risk_signals),
  ], MAX_LIST_ITEMS);

  const lines = [
    formatSection("Person", [user.name, user.email].filter(Boolean).join(" — ")),
    formatSection("Summary", asString(research.summary)),
    formatSection("Role", asString(googleData.role) || asString(research.currentRole) || asString(research.current_role)),
    formatSection("Company URL", asString(googleData.company_url)),
    formatSection("Background", asString(research.backgroundSummary) || asString(research.background_summary)),
    formatList("Strengths", asStringArray(research.strengths)),
    formatList("Focus Areas", asStringArray(research.areasToFocusOn)),
    formatList("Interests", asStringArray(research.interests)),
    formatSection("Project Fit", asString(research.relevanceToProject) || asString(research.project_fit)),
    formatSection("Research Confidence", asString(research.confidence)),
    formatList("Fit Signals", fitSignals),
    formatList("Risk Signals", riskSignals),
    formatList("Founder Signals", asStringArray(googleData.founder_signals)),
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

export async function buildFounderProfileSummary(userId: string): Promise<string> {
  const db = getDb();
  const rows = await db`
    SELECT name, email, google_data
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `;

  if (rows.length === 0) return "";

  return buildFounderResearchSummary({
    name: rows[0].name as string | null,
    email: rows[0].email as string | null,
    googleData: asRecord(rows[0].google_data),
  });
}

export async function buildCompanyProfileSummary(projectId: string): Promise<string> {
  const db = getDb();
  const projectRows = await db`
    SELECT name, slug, company_email, landing_page_published
    FROM projects
    WHERE id = ${projectId}
    LIMIT 1
  `;

  if (projectRows.length === 0) return "";
  const project = projectRows[0];

  const [memoryRows, taskRows] = await Promise.all([
    db`
      SELECT key, value
      FROM memory
      WHERE project_id = ${projectId} AND key IN (
        'companyName',
        'tagline',
        'companyDescription',
        'mission',
        'targetAudience',
        'competitors',
        'keyInsights',
        'landingPageUrl',
        'companyUrl',
        'founderRole',
        'companyEmail',
        'founderSignals',
        'founderDirectives'
      )
    `,
    db`
      SELECT title, status, priority
      FROM tasks
      WHERE project_id = ${projectId} AND status IN ('queued', 'running', 'pending_confirmation')
      ORDER BY priority ASC, created_at DESC
      LIMIT 3
    `,
  ]);

  const memory = memoryRows.reduce<JsonMap>((acc, row) => {
    acc[row.key as string] = row.value;
    return acc;
  }, {});

  const activePriorities = taskRows.map((row) => `${row.title} (${row.status})`);
  const landingPageUrl = asString(memory.landingPageUrl)
    || (project.landing_page_published ? `https://${project.slug}.${process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com"}` : undefined);

  const lines = [
    formatSection("Company", asString(memory.companyName) || asString(project.name)),
    formatSection("Tagline", asString(memory.tagline)),
    formatSection("Description", asString(memory.companyDescription)),
    formatSection("Mission", asString(memory.mission)),
    formatSection("Target Audience", asString(memory.targetAudience)),
    formatSection("Founder Role", asString(memory.founderRole)),
    formatSection("Website", asString(memory.companyUrl) || landingPageUrl),
    formatSection("Company Email", asString(memory.companyEmail) || asString(project.company_email)),
    formatList("Competitors", asStringArray(memory.competitors)),
    formatList("Key Insights", asStringArray(memory.keyInsights)),
    formatList("Founder Signals", asStringArray(memory.founderSignals)),
    formatSection("Founder Direction", asString(memory.founderDirectives)),
    formatList("Current Priorities", activePriorities),
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

function looksLikeFounderSignal(sentence: string): boolean {
  return /\b(i want|i need|i prefer|i care about|i'm focused on|i am focused on|my goal is|my priority is|we want|we need|we prefer|we care about|we're focused on|we are focused on|our goal is|our priority is|focus on|priority is|target audience is|customers are|customer is|avoid|don't want|do not want|budget|timeline)\b/i.test(sentence);
}

function extractFounderSignals(text: string): string[] {
  const candidates = text
    .replace(/\r/g, "\n")
    .split(/\n|(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim().replace(/^[*-]\s*/, ""))
    .filter((sentence) => sentence.length >= 24 && sentence.length <= 220)
    .filter((sentence) => looksLikeFounderSignal(sentence))
    .map((sentence) => compactText(sentence, 180));

  return uniqueStrings(candidates, 4);
}

export async function captureFounderSignals(opts: {
  userId: string;
  projectId?: string;
  text: string;
}): Promise<string[]> {
  const extracted = extractFounderSignals(opts.text);
  if (extracted.length === 0) return [];

  const db = getDb();
  const userRows = await db`
    SELECT google_data
    FROM users
    WHERE id = ${opts.userId}
    LIMIT 1
  `;

  if (userRows.length === 0) return [];

  const googleData = asRecord(userRows[0].google_data);
  const existingUserSignals = asStringArray(googleData.founder_signals, MAX_SIGNALS);
  const mergedUserSignals = uniqueStrings([...extracted, ...existingUserSignals], MAX_SIGNALS);

  if (JSON.stringify(mergedUserSignals) !== JSON.stringify(existingUserSignals)) {
    const nextGoogleData = {
      ...googleData,
      founder_signals: mergedUserSignals,
      founder_signals_updated_at: new Date().toISOString(),
    };
    await db`
      UPDATE users
      SET google_data = ${JSON.stringify(nextGoogleData)}::jsonb
      WHERE id = ${opts.userId}
    `;
  }

  if (opts.projectId) {
    const existingRows = await db`
      SELECT value
      FROM memory
      WHERE project_id = ${opts.projectId} AND key = 'founderSignals'
      LIMIT 1
    `;
    const existingCompanySignals = existingRows.length > 0
      ? asStringArray(existingRows[0].value, MAX_SIGNALS)
      : [];
    const mergedCompanySignals = uniqueStrings([...extracted, ...existingCompanySignals], MAX_SIGNALS);

    if (JSON.stringify(mergedCompanySignals) !== JSON.stringify(existingCompanySignals)) {
      await db`
        INSERT INTO memory (project_id, key, value)
        VALUES (${opts.projectId}, 'founderSignals', ${JSON.stringify(mergedCompanySignals)}::jsonb)
        ON CONFLICT (project_id, key) DO UPDATE
        SET value = ${JSON.stringify(mergedCompanySignals)}::jsonb
      `;
    }
  }

  return extracted;
}

export function summarizeContentForMemory(content: string, maxChars: number = 900): string {
  return extractFirstParagraph(content, maxChars) || compactText(content, maxChars);
}
