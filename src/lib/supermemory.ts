import { createHash } from "node:crypto";
import Supermemory from "supermemory";
import { getDb } from "./neon";
import {
  buildCompanyProfileSummary,
  buildFounderProfileSummary,
} from "./personalization";

let _client: Supermemory | null = null;
type MemoryScope = "user" | "company";
type MemoryMetadataValue = string | number | boolean;
type MemoryMetadata = Record<string, MemoryMetadataValue>;
type MemorySyncState = {
  hash: string;
  updatedAt: string;
  customId?: string;
  memoryId?: string | null;
};
type MemorySyncMap = Record<string, MemorySyncState>;

const MAX_MEMORY_CONTENT_CHARS = 2200;
const MAX_RELEVANT_CONTEXT_CHARS = 1800;
const MAX_SYNC_ENTRIES = 150;
const LOW_SIGNAL_QUERIES = new Set([
  "hi",
  "hello",
  "hey",
  "thanks",
  "thank you",
  "ok",
  "okay",
  "cool",
  "sounds good",
]);

function getClient(): Supermemory {
  if (!_client) {
    _client = new Supermemory({
      apiKey: process.env.SUPERMEMORY_API_KEY,
    });
  }
  return _client;
}

export function userTag(userId: string) {
  return `artha_user_${userId}`;
}

export function companyTag(projectId: string) {
  return `artha_company_${projectId}`;
}

function normalizeMemoryContent(content: string, maxChars: number = MAX_MEMORY_CONTENT_CHARS): string {
  const normalized = content
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (normalized.length <= maxChars) return normalized;

  const preferredBreaks = [
    normalized.lastIndexOf("\n\n", maxChars),
    normalized.lastIndexOf(". ", maxChars),
    normalized.lastIndexOf("\n", maxChars),
    normalized.lastIndexOf(" ", maxChars),
  ];
  const cutIndex = preferredBreaks.find((value) => value > Math.floor(maxChars * 0.6)) ?? maxChars;

  return `${normalized.slice(0, cutIndex).trim()}...`;
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function pruneSyncMap(syncMap: MemorySyncMap): MemorySyncMap {
  return Object.fromEntries(
    Object.entries(syncMap)
      .sort(([, left], [, right]) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, MAX_SYNC_ENTRIES)
  );
}

function shouldSearchSemanticMemory(query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized || normalized.length < 16) return false;
  if (LOW_SIGNAL_QUERIES.has(normalized)) return false;
  if (/^(hi|hello|thanks|thank you|ok|okay)[.!?]*$/.test(normalized)) return false;
  return true;
}

function shouldPersistConversation(messages: string): boolean {
  const normalized = messages.replace(/\s+/g, " ").trim();
  if (normalized.length < 220) return false;
  if (/(error:|something went wrong|no context available yet|you need credits|add more credits)/i.test(normalized)) {
    return false;
  }

  return /\b(prefer|priority|goal|focus|customer|audience|pricing|strategy|launch|roadmap|constraint|budget|timeline|competitor|mission|website|email|outreach|research|founder|positioning)\b/i.test(normalized);
}

function deriveOwnershipFromContainerTag(containerTag: string): {
  scope?: MemoryScope;
  userId?: string;
  projectId?: string;
} {
  if (containerTag.startsWith("artha_user_")) {
    const userId = containerTag.slice("artha_user_".length);
    return { scope: "user", userId: userId || undefined };
  }

  if (containerTag.startsWith("artha_company_")) {
    const projectId = containerTag.slice("artha_company_".length);
    return { scope: "company", projectId: projectId || undefined };
  }

  return {};
}

function buildOwnershipMetadata(opts: {
  containerTag: string;
  metadata?: MemoryMetadata;
  scope?: MemoryScope;
  userId?: string;
  projectId?: string;
}): MemoryMetadata | undefined {
  const derived = deriveOwnershipFromContainerTag(opts.containerTag);
  const scope = opts.scope ?? derived.scope;
  const userId = opts.userId ?? derived.userId;
  const projectId = opts.projectId ?? derived.projectId;

  const metadata: MemoryMetadata = {
    ...(opts.metadata || {}),
    containerTag: opts.containerTag,
    ...(scope ? { scope } : {}),
    ...(userId ? { userId } : {}),
    ...(projectId ? { projectId } : {}),
  };

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

async function getUserSyncMap(userId: string): Promise<MemorySyncMap> {
  const db = getDb();
  const rows = await db`
    SELECT google_data
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `;

  if (rows.length === 0) return {};
  const googleData = rows[0].google_data as Record<string, unknown> | null;
  const syncMap = googleData?.supermemory_sync;
  return syncMap && typeof syncMap === "object" && !Array.isArray(syncMap)
    ? syncMap as MemorySyncMap
    : {};
}

async function setUserSyncMap(userId: string, nextSyncMap: MemorySyncMap): Promise<void> {
  const db = getDb();
  const rows = await db`
    SELECT google_data
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `;

  if (rows.length === 0) return;
  const googleData = ((rows[0].google_data as Record<string, unknown> | null) || {});
  const nextGoogleData = {
    ...googleData,
    supermemory_sync: pruneSyncMap(nextSyncMap),
  };
  await db`
    UPDATE users
    SET google_data = ${JSON.stringify(nextGoogleData)}::jsonb
    WHERE id = ${userId}
  `;
}

async function getCompanySyncMap(projectId: string): Promise<MemorySyncMap> {
  const db = getDb();
  const rows = await db`
    SELECT value
    FROM memory
    WHERE project_id = ${projectId} AND key = 'supermemorySync'
    LIMIT 1
  `;

  if (rows.length === 0) return {};
  const syncMap = rows[0].value;
  return syncMap && typeof syncMap === "object" && !Array.isArray(syncMap)
    ? syncMap as MemorySyncMap
    : {};
}

async function setCompanySyncMap(projectId: string, nextSyncMap: MemorySyncMap): Promise<void> {
  const db = getDb();
  const pruned = pruneSyncMap(nextSyncMap);
  await db`
    INSERT INTO memory (project_id, key, value)
    VALUES (${projectId}, 'supermemorySync', ${JSON.stringify(pruned)}::jsonb)
    ON CONFLICT (project_id, key) DO UPDATE
    SET value = ${JSON.stringify(pruned)}::jsonb
  `;
}

async function getSyncMap(opts: { scope?: MemoryScope; userId?: string; projectId?: string }): Promise<MemorySyncMap> {
  if ((opts.scope === "company" || opts.projectId) && opts.projectId) {
    return getCompanySyncMap(opts.projectId);
  }

  if ((opts.scope === "user" || opts.userId) && opts.userId) {
    return getUserSyncMap(opts.userId);
  }

  return {};
}

async function setSyncMap(
  opts: { scope?: MemoryScope; userId?: string; projectId?: string },
  nextSyncMap: MemorySyncMap
): Promise<void> {
  if ((opts.scope === "company" || opts.projectId) && opts.projectId) {
    await setCompanySyncMap(opts.projectId, nextSyncMap);
    return;
  }

  if ((opts.scope === "user" || opts.userId) && opts.userId) {
    await setUserSyncMap(opts.userId, nextSyncMap);
  }
}

export async function ingestMemory(opts: {
  content: string;
  containerTag: string;
  customId?: string;
  dedupeKey?: string;
  metadata?: MemoryMetadata;
  scope?: MemoryScope;
  userId?: string;
  projectId?: string;
}): Promise<string | null> {
  try {
    const client = getClient();
    const content = normalizeMemoryContent(opts.content);
    if (!content) return null;

    const metadata = buildOwnershipMetadata(opts);
    const contentHash = hashContent(content);
    const dedupeKey = opts.dedupeKey
      || opts.customId
      || `${opts.containerTag}:${metadata?.type || "memory"}`;
    const syncMap = await getSyncMap(opts);
    const previous = syncMap[dedupeKey];

    if (previous?.hash === contentHash) {
      return previous.memoryId || null;
    }

    const result = await client.add({
      content,
      containerTag: opts.containerTag,
      customId: opts.customId,
      metadata,
    });

    if (dedupeKey) {
      await setSyncMap(opts, {
        ...syncMap,
        [dedupeKey]: {
          hash: contentHash,
          updatedAt: new Date().toISOString(),
          customId: opts.customId,
          memoryId: result?.id ?? null,
        },
      });
    }

    return result?.id ?? null;
  } catch (err) {
    console.error("[supermemory] ingest failed:", err);
    return null;
  }
}

export async function getRelevantContext(opts: {
  query: string;
  containerTag: string;
  limit?: number;
  threshold?: number;
}): Promise<string> {
  if (!shouldSearchSemanticMemory(opts.query)) {
    return "";
  }

  try {
    const client = getClient();
    const results = await client.search.memories({
      q: opts.query,
      containerTag: opts.containerTag,
      searchMode: "hybrid",
      limit: opts.limit ?? 8,
      threshold: opts.threshold ?? 0.5,
    });

    return normalizeMemoryContent(
      results.results
      .map((r: { memory?: string; chunk?: string }) => r.memory || r.chunk || "")
      .filter(Boolean)
      .join("\n\n"),
      MAX_RELEVANT_CONTEXT_CHARS
    );
  } catch (err) {
    console.error("[supermemory] search failed:", err);
    return "";
  }
}

interface ProfileResult {
  staticFacts: string[];
  dynamicFacts: string[];
  relevantMemories: string[];
}

export async function getProfile(opts: {
  containerTag: string;
  query?: string;
}): Promise<ProfileResult> {
  try {
    const client = getClient();
    const profile = await client.profile({
      containerTag: opts.containerTag,
      q: opts.query || "",
    });

    return {
      staticFacts: profile.profile?.static || [],
      dynamicFacts: profile.profile?.dynamic || [],
      relevantMemories: (profile.searchResults?.results || []).map(
        (r: unknown) => {
          const item = r as { memory?: string; chunk?: string };
          return item.memory || item.chunk || "";
        }
      ).filter(Boolean),
    };
  } catch (err) {
    console.error("[supermemory] profile failed:", err);
    return { staticFacts: [], dynamicFacts: [], relevantMemories: [] };
  }
}

/**
 * Build a full context block for AI prompts by combining:
 * 1. Structured company facts from Neon
 * 2. Structured founder profile data from Neon
 * 3. Relevant semantic memories from Supermemory when the query is substantial
 */
export async function buildTaskContext(opts: {
  projectId: string;
  userId: string;
  taskDescription: string;
}): Promise<string> {
  const [companySummary, relevantContext, founderSummary] = await Promise.all([
    buildCompanyProfileSummary(opts.projectId),
    getRelevantContext({
      query: opts.taskDescription,
      containerTag: companyTag(opts.projectId),
      limit: 6,
      threshold: 0.45,
    }),
    buildFounderProfileSummary(opts.userId),
  ]);

  const sections: string[] = [];

  if (companySummary) {
    sections.push(`## Company\n${companySummary}`);
  }

  if (founderSummary) {
    sections.push(`## Person\n${founderSummary}`);
  }

  if (relevantContext) {
    sections.push(`## Relevant Context\n${relevantContext}`);
  }

  return sections.join("\n\n") || "No context available yet.";
}

/**
 * Build chat-specific context from local structured summaries first,
 * then add semantic memories only when the message is substantive.
 */
export async function buildChatContext(opts: {
  projectId: string;
  userId: string;
  userMessage: string;
}): Promise<string> {
  const [companySummary, founderSummary, relevant] = await Promise.all([
    buildCompanyProfileSummary(opts.projectId),
    buildFounderProfileSummary(opts.userId),
    getRelevantContext({
      query: opts.userMessage,
      containerTag: companyTag(opts.projectId),
      limit: 4,
      threshold: 0.55,
    }),
  ]);

  const sections: string[] = [];

  if (companySummary) {
    sections.push(`Company:\n${companySummary}`);
  }

  if (founderSummary) {
    sections.push(`Person:\n${founderSummary}`);
  }

  if (relevant) {
    sections.push(`Relevant Context:\n${relevant}`);
  }

  return sections.join("\n\n") || "No context available yet.";
}

/**
 * Ingest a completed task's result back into memory so future tasks benefit.
 */
export async function ingestTaskResult(opts: {
  projectId: string;
  userId?: string;
  taskId: string;
  taskTitle: string;
  taskType: string;
  summary: string;
  result?: string;
}) {
  const content = [
    `Task completed: ${opts.taskTitle}`,
    `Type: ${opts.taskType}`,
    `Summary: ${opts.summary}`,
    opts.result ? `Details: ${opts.result.slice(0, 2000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  await ingestMemory({
    content,
    containerTag: companyTag(opts.projectId),
    dedupeKey: `task_result_${opts.taskId}`,
    projectId: opts.projectId,
    userId: opts.userId,
    customId: `task_result_${opts.taskId}`,
    metadata: { type: "task_result", taskType: opts.taskType },
  });
}

/**
 * Ingest a conversation exchange into memory.
 */
export async function ingestConversation(opts: {
  projectId: string;
  userId?: string;
  customId: string;
  messages: string;
}) {
  if (!shouldPersistConversation(opts.messages)) {
    return;
  }

  await ingestMemory({
    content: opts.messages,
    containerTag: companyTag(opts.projectId),
    dedupeKey: hashContent(normalizeMemoryContent(opts.messages)),
    projectId: opts.projectId,
    userId: opts.userId,
    customId: opts.customId,
    metadata: { type: "conversation" },
  });
}

/**
 * Ingest an inbound email into company memory.
 */
export async function ingestInboundEmail(opts: {
  projectId: string;
  userId?: string;
  emailId: string;
  from: string;
  subject: string;
  body: string;
}) {
  await ingestMemory({
    content: `Email from ${opts.from}\nSubject: ${opts.subject}\n\n${opts.body}`,
    containerTag: companyTag(opts.projectId),
    dedupeKey: `inbound_email_${opts.emailId}`,
    projectId: opts.projectId,
    userId: opts.userId,
    customId: `inbound_email_${opts.emailId}`,
    metadata: { type: "inbound_email", from: opts.from },
  });
}
