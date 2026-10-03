/**
 * Web search utility — three engines, one interface.
 *
 * Engines:
 * - Exa    (semantic/neural): Person/entity search, lead discovery, competitor
 *          finding, content extraction (getContents), findSimilar
 * - Brave  (keyword):         Market research, idea validation, general news & trends
 * - Tavily (hybrid):          General-purpose search + deep content extraction
 *
 * Which engine runs for each task is controlled by `src/config/search-engines.ts`.
 * Falls back gracefully (returns empty results) if API keys are not set.
 *
 * Env vars: EXA_API_KEY, BRAVE_SEARCH_API_KEY, TAVILY_API_KEY_DEV/TAVILY_API_KEY_PROD
 * Exa & Brave use a single key. Tavily uses dev/prod keys.
 * Fallback: if Exa/Brave fail → Tavily is tried.
 */

import Exa from "exa-js";
import { tavily } from "@tavily/core";

// ── Constants ──────────────────────────────────────────────────────

const PERSONAL_EMAIL_PROVIDERS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "hey.com",
  "fastmail.com",
]);

// ── Types ──────────────────────────────────────────────────────────

export type SearchEngine = "exa" | "brave" | "tavily" | "auto";

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  rawContent?: string;
  score: number;
  publishedDate?: string;
}

export interface WebSearchResponse {
  query: string;
  answer?: string;
  results: WebSearchResult[];
}

export interface WebExtractResult {
  url: string;
  title: string | null;
  rawContent: string;
}

export interface WebExtractResponse {
  results: WebExtractResult[];
  failedResults: Array<{ url: string; error: string }>;
}

export interface FindSimilarResponse {
  sourceUrl: string;
  results: WebSearchResult[];
}

// ── Client setup ───────────────────────────────────────────────────

function getExaApiKey(): string | undefined {
  return process.env.EXA_API_KEY;
}

let _exaClient: Exa | null | undefined;
function getExaClient(): Exa | null {
  if (_exaClient !== undefined) return _exaClient;
  const apiKey = getExaApiKey();
  _exaClient = apiKey ? new Exa(apiKey) : null;
  return _exaClient;
}

function getBraveApiKey(): string | undefined {
  return process.env.BRAVE_SEARCH_API_KEY;
}

function getTavilyApiKey(): string | undefined {
  const isProduction = process.env.NODE_ENV === "production";
  return isProduction
    ? process.env.TAVILY_API_KEY_PROD ?? process.env.TAVILY_API_KEY
    : process.env.TAVILY_API_KEY_DEV ?? process.env.TAVILY_API_KEY;
}

function getTavilyClient() {
  const apiKey = getTavilyApiKey();
  if (!apiKey) return null;
  return tavily({ apiKey });
}

// ── Engine implementations ─────────────────────────────────────────

async function searchExa(
  query: string,
  options: {
    maxResults?: number;
    includeDomains?: string[];
    excludeDomains?: string[];
    type?: "neural" | "keyword" | "auto";
    textMaxChars?: number;
  } = {}
): Promise<WebSearchResponse> {
  const client = getExaClient();
  if (!client) return { query, results: [] };

  try {
    const response = await client.searchAndContents(query, {
      type: options.type ?? "auto",
      numResults: options.maxResults ?? 5,
      includeDomains: options.includeDomains,
      excludeDomains: options.excludeDomains,
      text: { maxCharacters: options.textMaxChars ?? 3000 },
      livecrawl: "fallback",
    });

    return {
      query,
      results: ((response as any).results || []).map((r: any) => ({
        title: r.title || "",
        url: r.url,
        content: r.summary || r.text || "",
        rawContent: r.text,
        score: r.score ?? 0,
        publishedDate: r.publishedDate,
      })),
    };
  } catch {
    return { query, results: [] };
  }
}

async function searchBrave(
  query: string,
  options: {
    maxResults?: number;
    freshness?: string;
  } = {}
): Promise<WebSearchResponse> {
  const apiKey = getBraveApiKey();
  if (!apiKey) return { query, results: [] };

  try {
    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(options.maxResults ?? 5, 20)),
    });
    if (options.freshness) params.set("freshness", options.freshness);

    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${params.toString()}`,
      {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
      }
    );

    if (!response.ok) return { query, results: [] };

    const data = (await response.json()) as {
      web?: {
        results?: Array<{
          title?: string;
          url: string;
          description?: string;
          extra_snippets?: string[];
          page_age?: string;
        }>;
      };
    };

    const webResults = data.web?.results || [];

    return {
      query,
      results: webResults.map((r, i) => ({
        title: r.title || "",
        url: r.url,
        content: r.description || "",
        rawContent: r.extra_snippets?.join("\n") || undefined,
        score: Math.max(0, 1 - i * 0.08), // Position-based score
        publishedDate: r.page_age || undefined,
      })),
    };
  } catch {
    return { query, results: [] };
  }
}

async function searchTavily(
  query: string,
  options: {
    depth?: "basic" | "advanced";
    maxResults?: number;
    includeRawContent?: false | "markdown" | "text";
    includeDomains?: string[];
    excludeDomains?: string[];
    maxTokens?: number;
    chunksPerSource?: number;
  } = {}
): Promise<WebSearchResponse> {
  const client = getTavilyClient();
  if (!client) return { query, results: [] };

  try {
    const response = await client.search(query, {
      searchDepth: options.depth ?? "basic",
      maxResults: options.maxResults ?? 5,
      includeAnswer: true,
      includeRawContent: options.includeRawContent ?? false,
      includeDomains: options.includeDomains,
      excludeDomains: options.excludeDomains,
      maxTokens: options.maxTokens,
      chunksPerSource: options.chunksPerSource,
    });

    return {
      query,
      answer: response.answer ?? undefined,
      results: (response.results || []).map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        rawContent: r.rawContent,
        score: r.score ?? 0,
        publishedDate: r.publishedDate,
      })),
    };
  } catch {
    return { query, results: [] };
  }
}

// ── Auto-routing ───────────────────────────────────────────────────

function autoResolveEngine(
  query: string,
  options?: { includeDomains?: string[] }
): "exa" | "brave" {
  // Domain-targeted queries → Exa (native includeDomains support)
  if (options?.includeDomains?.length) return "exa";
  // Quoted person/entity names → Exa (semantic search excels)
  if (/^"[^"]+"/.test(query.trim())) return "exa";
  // Market / trend / news queries → Brave (broader keyword coverage)
  if (/market size|industry trend|funding|landscape|competitors?\s+\d{4}/i.test(query)) return "brave";
  // Default → Brave for general queries (fastest, broadest)
  return "brave";
}

// ── Core search functions ──────────────────────────────────────────

/**
 * Run a single web search. Engine is chosen automatically or by the caller.
 * Falls back to the other engine if the primary returns no results.
 */
export async function searchWeb(
  query: string,
  options?: {
    engine?: SearchEngine;
    depth?: "basic" | "advanced" | "fast" | "ultra-fast";
    maxResults?: number;
    includeRawContent?: false | "markdown" | "text";
    includeDomains?: string[];
    excludeDomains?: string[];
    exactMatch?: boolean;
    maxTokens?: number;
    chunksPerSource?: number;
    freshness?: string;
  }
): Promise<WebSearchResponse> {
  const engine = options?.engine ?? "auto";
  const resolved = engine === "auto"
    ? autoResolveEngine(query, options)
    : engine;

  const depth = options?.depth ?? "basic";
  const maxResults = options?.maxResults ?? 5;

  // Dispatch to the resolved engine, fall back to others on empty results
  const primary = await dispatchSearch(resolved, query, depth, maxResults, options);
  if (primary.results.length > 0) return primary;

  // Fallback chain: try other engines
  const fallbacks: Array<"exa" | "brave" | "tavily"> = (["exa", "brave", "tavily"] as const).filter((e) => e !== resolved);
  for (const fb of fallbacks) {
    const result = await dispatchSearch(fb, query, depth, maxResults, options);
    if (result.results.length > 0) return result;
  }

  return primary; // empty
}

async function dispatchSearch(
  engine: "exa" | "brave" | "tavily",
  query: string,
  depth: string,
  maxResults: number,
  options?: {
    includeDomains?: string[];
    excludeDomains?: string[];
    maxTokens?: number;
    freshness?: string;
    includeRawContent?: false | "markdown" | "text";
    chunksPerSource?: number;
  }
): Promise<WebSearchResponse> {
  switch (engine) {
    case "exa":
      return searchExa(query, {
        maxResults,
        includeDomains: options?.includeDomains,
        excludeDomains: options?.excludeDomains,
        type: depth === "advanced" ? "neural" : "auto",
        textMaxChars: options?.maxTokens ?? 3000,
      });
    case "brave":
      return searchBrave(query, { maxResults, freshness: options?.freshness });
    case "tavily":
      return searchTavily(query, {
        depth: depth === "advanced" ? "advanced" : "basic",
        maxResults,
        includeRawContent: options?.includeRawContent,
        includeDomains: options?.includeDomains,
        excludeDomains: options?.excludeDomains,
        maxTokens: options?.maxTokens,
        chunksPerSource: options?.chunksPerSource,
      });
  }
}

/**
 * Run multiple searches in parallel. Returns all responses.
 */
export async function searchWebMulti(
  queries: string[],
  options?: {
    engine?: SearchEngine;
    depth?: "basic" | "advanced" | "fast" | "ultra-fast";
    maxResultsPerQuery?: number;
    includeRawContent?: false | "markdown" | "text";
    includeDomains?: string[];
    excludeDomains?: string[];
    exactMatch?: boolean;
    maxTokens?: number;
    chunksPerSource?: number;
    freshness?: string;
  }
): Promise<WebSearchResponse[]> {
  return Promise.all(
    queries.map((q) =>
      searchWeb(q, {
        engine: options?.engine,
        depth: options?.depth,
        maxResults: options?.maxResultsPerQuery ?? 5,
        includeRawContent: options?.includeRawContent,
        includeDomains: options?.includeDomains,
        excludeDomains: options?.excludeDomains,
        exactMatch: options?.exactMatch,
        maxTokens: options?.maxTokens,
        chunksPerSource: options?.chunksPerSource,
        freshness: options?.freshness,
      })
    )
  );
}

// ── Content extraction (Exa getContents) ───────────────────────────

/**
 * Extract readable content from specific URLs.
 * Tries Exa getContents first (with livecrawl fallback), then Tavily extract.
 */
export async function extractWeb(
  urls: string[],
  options?: {
    depth?: "basic" | "advanced";
    format?: "markdown" | "text";
    query?: string;
    chunksPerSource?: number;
  }
): Promise<WebExtractResponse> {
  const dedupedUrls = [...new Set(urls.filter(Boolean))];
  if (dedupedUrls.length === 0) {
    return { results: [], failedResults: [] };
  }

  // Try Exa first
  const exaClient = getExaClient();
  if (exaClient) {
    const maxCharsPerSource = (options?.chunksPerSource ?? 3) * 1500;
    try {
      const response = await exaClient.getContents(dedupedUrls, {
        text: { maxCharacters: maxCharsPerSource },
        livecrawl: "fallback",
      });

      const results: WebExtractResult[] = [];
      const failedResults: Array<{ url: string; error: string }> = [];

      for (const r of (response as any).results || []) {
        if (r.text) {
          results.push({ url: r.url, title: r.title || null, rawContent: r.text });
        } else {
          failedResults.push({ url: r.url, error: "No content extracted" });
        }
      }

      const returnedUrls = new Set(((response as any).results || []).map((r: any) => r.url));
      for (const url of dedupedUrls) {
        if (!returnedUrls.has(url)) {
          failedResults.push({ url, error: "URL not found in index" });
        }
      }

      return { results, failedResults };
    } catch {
      // Fall through to Tavily
    }
  }

  // Fallback: Tavily extract
  const tavilyClient = getTavilyClient();
  if (tavilyClient) {
    try {
      const response = await tavilyClient.extract(dedupedUrls, {
        extractDepth: options?.depth ?? "advanced",
        format: options?.format ?? "markdown",
        query: options?.query,
        chunksPerSource: options?.chunksPerSource ?? 3,
      });

      return {
        results: (response.results || []).map((r) => ({
          url: r.url,
          title: r.title,
          rawContent: r.rawContent,
        })),
        failedResults: (response.failedResults || []).map((r) => ({
          url: r.url,
          error: r.error,
        })),
      };
    } catch {
      return { results: [], failedResults: [] };
    }
  }

  return { results: [], failedResults: [] };
}

// ── Find similar (Exa-exclusive) ───────────────────────────────────

/**
 * Find pages similar to a given URL. Powered by Exa's neural similarity search.
 * Great for discovering competitors, similar companies, or related content.
 */
export async function findSimilar(
  url: string,
  options?: {
    maxResults?: number;
    includeDomains?: string[];
    excludeDomains?: string[];
    textMaxChars?: number;
  }
): Promise<FindSimilarResponse> {
  const client = getExaClient();
  if (!client) return { sourceUrl: url, results: [] };

  try {
    const response = await client.findSimilarAndContents(url, {
      numResults: options?.maxResults ?? 5,
      includeDomains: options?.includeDomains,
      excludeDomains: options?.excludeDomains,
      text: { maxCharacters: options?.textMaxChars ?? 2000 },
      livecrawl: "fallback",
    });

    return {
      sourceUrl: url,
      results: ((response as any).results || []).map((r: any) => ({
        title: r.title || "",
        url: r.url,
        content: r.text || "",
        score: r.score ?? 0,
        publishedDate: r.publishedDate,
      })),
    };
  } catch {
    return { sourceUrl: url, results: [] };
  }
}

// ── Format helpers ─────────────────────────────────────────────────

/**
 * Format search responses into a concise context block for LLM prompts.
 */
export function formatSearchContext(searches: WebSearchResponse[], snippetLength = 500): string {
  const nonEmpty = searches.filter((s) => s.results.length > 0);
  if (nonEmpty.length === 0) return "";

  const lines: string[] = ["=== Live Web Research ===", ""];

  for (const search of nonEmpty) {
    lines.push(`[Search: "${search.query}"]`);
    if (search.answer) {
      lines.push(`Summary: ${search.answer}`, "");
    }
    for (const result of search.results.slice(0, 4)) {
      const snippet = result.content.length > snippetLength
        ? result.content.slice(0, snippetLength) + "…"
        : result.content;
      lines.push(`• ${result.title}`);
      lines.push(`  ${result.url}`);
      lines.push(`  ${snippet}`, "");
    }
  }

  return lines.join("\n").trimEnd();
}

/**
 * Format extracted page content into a concise context block for LLM prompts.
 */
export function formatExtractContext(
  extracts: WebExtractResult[],
  snippetLength = 1400
): string {
  const nonEmpty = extracts.filter((extract) => extract.rawContent.trim().length > 0);
  if (nonEmpty.length === 0) return "";

  const lines: string[] = ["=== Extracted Source Content ===", ""];

  for (const extract of nonEmpty) {
    const snippet = extract.rawContent
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, snippetLength);

    lines.push(`• ${extract.title || extract.url}`);
    lines.push(`  ${extract.url}`);
    lines.push(`  ${snippet}${extract.rawContent.length > snippetLength ? "…" : ""}`, "");
  }

  return lines.join("\n").trimEnd();
}

/**
 * Detect the source type label from a URL for the labeled extract context.
 */
function detectSourceLabel(url: string): string {
  const normalized = url.toLowerCase();
  if (/linkedin\.com\/in\//.test(normalized)) return "LinkedIn Profile";
  if (/linkedin\.com\/company\//.test(normalized)) return "LinkedIn Company";
  if (/github\.com\/[^/]+\/?$/.test(normalized)) return "GitHub Profile";
  if (/github\.com\/[^/]+\/[^/]+/.test(normalized)) return "GitHub Repository";
  if (/(x|twitter)\.com\/[^/]+\/?$/.test(normalized)) return "Twitter/X Profile";
  if (/crunchbase\.com\/person\//.test(normalized)) return "Crunchbase Profile";
  if (/crunchbase\.com\/organization\//.test(normalized)) return "Crunchbase Company";
  if (/(angel\.co|wellfound\.com)/.test(normalized)) return "AngelList/Wellfound Profile";
  if (/(medium\.com\/@|substack\.com)/.test(normalized)) return "Blog/Newsletter";
  if (/(dev\.to|hashnode\.dev)/.test(normalized)) return "Developer Blog";
  if (/(about|bio|team|founder|speaker)/.test(normalized)) return "Personal/About Page";
  return "Web Page";
}

/**
 * Check if a URL is a high-priority social/professional profile.
 */
export function isPriorityProfileUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  return /linkedin\.com\/in\/|github\.com\/[^/]+\/?$|(x|twitter)\.com\/[^/]+\/?$|crunchbase\.com\/person\//.test(normalized);
}

/**
 * Format extracted page content with source-type labels and variable snippet lengths.
 * Priority sources (LinkedIn, GitHub, Twitter) get more content.
 */
export function formatLabeledExtractContext(
  priorityExtracts: WebExtractResult[],
  secondaryExtracts: WebExtractResult[],
  prioritySnippetLength = 2500,
  secondarySnippetLength = 1400
): string {
  const allEmpty = [...priorityExtracts, ...secondaryExtracts].every(
    (e) => !e.rawContent.trim()
  );
  if (allEmpty) return "";

  const lines: string[] = [];

  for (const extract of priorityExtracts) {
    if (!extract.rawContent.trim()) continue;
    const label = detectSourceLabel(extract.url);
    const snippet = extract.rawContent
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, prioritySnippetLength);
    lines.push(`=== ${label} ===`);
    lines.push(`URL: ${extract.url}`);
    lines.push(snippet + (extract.rawContent.length > prioritySnippetLength ? "…" : ""));
    lines.push("");
  }

  for (const extract of secondaryExtracts) {
    if (!extract.rawContent.trim()) continue;
    const label = detectSourceLabel(extract.url);
    const snippet = extract.rawContent
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, secondarySnippetLength);
    lines.push(`=== ${label} ===`);
    lines.push(`URL: ${extract.url}`);
    lines.push(snippet + (extract.rawContent.length > secondarySnippetLength ? "…" : ""));
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

/**
 * Format findSimilar results into a context block for LLM prompts.
 */
export function formatFindSimilarContext(
  response: FindSimilarResponse,
  snippetLength = 500
): string {
  if (response.results.length === 0) return "";

  const lines: string[] = ["=== Similar Companies & Competitors ===", ""];

  for (const r of response.results) {
    const snippet = r.content.length > snippetLength
      ? r.content.slice(0, snippetLength) + "…"
      : r.content;
    lines.push(`• ${r.title}`);
    lines.push(`  ${r.url}`);
    if (snippet) lines.push(`  ${snippet}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

// ── Query builders ─────────────────────────────────────────────────

/**
 * Build market research queries from a company description / topic.
 */
export function buildMarketResearchQueries(companyPrompt: string): string[] {
  const topic = companyPrompt.slice(0, 80).trim();
  return [
    `${topic} competitors 2025 2026`,
    `${topic} market size industry trends`,
    `${topic} startups funding landscape`,
  ];
}

/**
 * Build lead research queries from the research prompt.
 */
export function buildLeadResearchQueries(prompt: string): string[] {
  const topic = prompt.slice(0, 120).trim();
  return [
    topic,
    `${topic.slice(0, 60)} companies contact decision maker`,
  ];
}

/**
 * Build search queries for the dedicated lead_finder agent.
 * More aggressive query strategy than the research agent's lead_research subtype.
 */
export function buildLeadFinderQueries(prompt: string): string[] {
  const topic = prompt.slice(0, 120).trim();
  return [
    topic,
    `${topic.slice(0, 60)} companies contact decision maker`,
    `${topic.slice(0, 60)} CEO CTO VP Head LinkedIn`,
    `${topic.slice(0, 60)} potential customers buyers 2025 2026`,
  ];
}

/**
 * Build queries for general-purpose research from the user's prompt.
 */
export function buildGeneralResearchQueries(prompt: string): string[] {
  return [prompt.slice(0, 150).trim()];
}

export interface PersonResearchQueries {
  general: string[];
  targeted: Array<{ query: string; domains: string[] }>;
}

/**
 * Build queries to research a specific person (for user onboarding research).
 * Returns general queries + domain-targeted queries for high-signal sites.
 */
export function buildPersonResearchQueries(opts: {
  name: string;
  email?: string;
  projectPrompt?: string;
  companyUrl?: string;
}): PersonResearchQueries {
  const name = opts.name.trim();
  if (!name || name === "Unknown") return { general: [], targeted: [] };

  const emailDomain = opts.email?.split("@")[1]?.toLowerCase().trim();
  const nonPersonalEmailDomain = emailDomain && !PERSONAL_EMAIL_PROVIDERS.has(emailDomain)
    ? emailDomain
    : undefined;
  const domainRoot = nonPersonalEmailDomain
    ?.replace(/^www\./, "")
    .split(".")
    .filter(Boolean)
    .slice(0, -1)
    .pop();
  const projectHint = opts.projectPrompt
    ?.replace(/\s+/g, " ")
    .trim()
    .slice(0, 72);
  const companyHost = opts.companyUrl
    ?.replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    ?.trim();

  // Build a disambiguation suffix from the strongest signal available
  const disambig = nonPersonalEmailDomain || companyHost || domainRoot || "";

  // General queries — broad web discovery
  const general = [
    `"${name}" profile background`,
    `"${name}" biography interview article`,
    nonPersonalEmailDomain ? `"${name}" ${nonPersonalEmailDomain}` : "",
    domainRoot ? `"${name}" ${domainRoot}` : "",
    companyHost ? `"${name}" ${companyHost}` : "",
    // Add email-local-part query if business email (helps disambiguate)
    nonPersonalEmailDomain && opts.email
      ? `"${opts.email.split("@")[0]}" ${nonPersonalEmailDomain} ${name.split(" ")[0]}`
      : "",
  ].filter(Boolean);

  // Domain-targeted queries — force results from high-signal sites
  // Include disambiguation context in targeted searches to avoid wrong-person results
  const targeted: Array<{ query: string; domains: string[] }> = [
    { query: disambig ? `"${name}" ${disambig}` : `"${name}"`, domains: ["linkedin.com"] },
    { query: `"${name}"`, domains: ["github.com"] },
    { query: `"${name}"`, domains: ["twitter.com", "x.com"] },
    { query: disambig ? `"${name}" ${disambig}` : `"${name}"`, domains: ["crunchbase.com", "angel.co", "wellfound.com"] },
  ];

  if (projectHint) {
    targeted.push({ query: `"${name}" ${projectHint}`, domains: ["medium.com", "substack.com", "dev.to"] });
  }

  if (nonPersonalEmailDomain) {
    targeted.push({ query: `"${name}" ${nonPersonalEmailDomain}`, domains: ["linkedin.com"] });
  }

  return { general: [...new Set(general)], targeted };
}

/**
 * Build queries for the onboarding pipeline idea research step.
 */
export function buildIdeaResearchQueries(prompt: string, url?: string): string[] {
  const topic = prompt.slice(0, 80).trim();
  const queries = [
    `${topic} top competitors 2025 2026`,
    `${topic} market size opportunity`,
  ];
  if (url) queries.push(`${url} company competitors alternatives`);
  return queries;
}
