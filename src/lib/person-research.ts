import {
  buildPersonResearchQueries,
  extractWeb,
  formatLabeledExtractContext,
  formatSearchContext,
  isPriorityProfileUrl,
  searchWeb,
  searchWebMulti,
  type WebExtractResult,
  type WebSearchResponse,
} from "./search";
import { getSearchEngine } from "@/config/search-engines";

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

export interface DiscoveredProfiles {
  linkedinUrl?: string;
  githubUsername?: string;
  twitterHandle?: string;
  personalSite?: string;
}

export interface PersonResearchContext {
  queries: string[];
  searches: WebSearchResponse[];
  searchContext: string;
  extractedContext: string;
  sourceUrls: string[];
  discoveredProfiles: DiscoveredProfiles;
}

function parseHost(url?: string): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function getEmailHost(email?: string): string | null {
  const host = email?.split("@")[1]?.trim().toLowerCase();
  return host || null;
}

function isPersonalEmailHost(host?: string | null): boolean {
  return host ? PERSONAL_EMAIL_PROVIDERS.has(host) : false;
}

function scorePersonUrl(url: string, opts: { companyHost?: string | null; emailHost?: string | null }): number {
  const normalized = url.toLowerCase();
  let score = 0;

  // Boosted scores for high-value profile pages
  if (/linkedin\.com\/in\//.test(normalized)) score += 12;
  if (/github\.com\/[^/]+\/?$/.test(normalized)) score += 10;
  if (/(x|twitter)\.com\/[^/]+\/?$/.test(normalized)) score += 8;
  if (/crunchbase\.com\/person\//.test(normalized)) score += 8;
  if (/(medium\.com\/@|substack\.com|speakerdeck\.com|angel\.co|wellfound\.com)/.test(normalized)) score += 5;
  if (/(about|team|bio|author|speaking|podcast|press|story|founder)/.test(normalized)) score += 4;
  if (opts.companyHost && normalized.includes(opts.companyHost)) score += 3;
  if (opts.emailHost && !isPersonalEmailHost(opts.emailHost) && normalized.includes(opts.emailHost)) score += 2;
  if (/\/posts\/|\/status\/|\/jobs\/|\/company\//.test(normalized)) score -= 3;
  if (/google\.com|facebook\.com|instagram\.com|youtube\.com|tiktok\.com/.test(normalized)) score -= 2;

  return score;
}

/**
 * Pick URLs to extract, splitting into priority (profiles) and secondary tiers.
 * Priority URLs (LinkedIn, GitHub, Twitter, Crunchbase) are always included first.
 */
function pickPersonResearchUrls(
  searches: WebSearchResponse[],
  opts: { companyHost?: string | null; emailHost?: string | null; limit?: number }
): { priority: string[]; secondary: string[] } {
  const ranked = new Map<string, number>();

  for (const search of searches) {
    for (const result of search.results) {
      if (!result.url.startsWith("http")) continue;

      const score = (result.score || 0) * 10 + scorePersonUrl(result.url, opts);
      const current = ranked.get(result.url);
      if (current === undefined || score > current) {
        ranked.set(result.url, score);
      }
    }
  }

  const sorted = [...ranked.entries()].sort((left, right) => right[1] - left[1]);
  const limit = opts.limit ?? 10;

  const priority: string[] = [];
  const secondary: string[] = [];

  // First pass: pick priority profile URLs
  for (const [url] of sorted) {
    if (priority.length + secondary.length >= limit) break;
    if (isPriorityProfileUrl(url)) {
      priority.push(url);
    }
  }

  // Second pass: fill remaining slots with secondary URLs
  for (const [url] of sorted) {
    if (priority.length + secondary.length >= limit) break;
    if (!priority.includes(url)) {
      secondary.push(url);
    }
  }

  return { priority, secondary };
}

// ── Profile discovery helpers ────────────────────────────────────

function findLinkedInUrl(searches: WebSearchResponse[]): string | undefined {
  for (const search of searches) {
    for (const result of search.results) {
      if (/linkedin\.com\/in\/[^/]+/i.test(result.url)) {
        return result.url;
      }
    }
  }
  return undefined;
}

function findGitHubUsername(searches: WebSearchResponse[]): string | undefined {
  for (const search of searches) {
    for (const result of search.results) {
      const match = result.url.match(/github\.com\/([a-zA-Z0-9-]+)\/?$/i);
      if (match && !["topics", "trending", "explore", "settings", "features", "marketplace"].includes(match[1].toLowerCase())) {
        return match[1];
      }
    }
  }
  return undefined;
}

function findTwitterHandle(searches: WebSearchResponse[]): string | undefined {
  for (const search of searches) {
    for (const result of search.results) {
      const match = result.url.match(/(?:x|twitter)\.com\/([a-zA-Z0-9_]+)\/?$/i);
      if (match && !["home", "explore", "search", "settings", "i"].includes(match[1].toLowerCase())) {
        return match[1];
      }
    }
  }
  return undefined;
}

function findPersonalSite(extracts: WebExtractResult[]): string | undefined {
  for (const extract of extracts) {
    const normalized = extract.url.toLowerCase();
    if (
      /(about|bio|portfolio|me\.|personal)/.test(normalized) &&
      !/linkedin|github|twitter|x\.com|crunchbase|medium|substack/.test(normalized)
    ) {
      return extract.url;
    }
  }
  return undefined;
}

/**
 * Try to extract the current company name from LinkedIn profile content.
 * Looks for common patterns in LinkedIn page extractions.
 */
function extractCompanyFromLinkedin(extracts: WebExtractResult[]): string | null {
  for (const extract of extracts) {
    if (!/linkedin\.com\/in\//i.test(extract.url)) continue;
    const content = extract.rawContent;

    // LinkedIn profiles often have "Title at Company" or "Company · Full-time"
    const atMatch = content.match(/(?:^|\n)\s*([^|\n]{2,40})\s+at\s+([^|\n]{2,50})/i);
    if (atMatch) return atMatch[2].trim();

    // Pattern: "Company Name\nCurrent position" or "Experience\nCompany Name"
    const experienceMatch = content.match(/Experience[^]*?\n\s*([A-Z][a-zA-Z0-9 &.,-]{2,40})\n/);
    if (experienceMatch) return experienceMatch[1].trim();
  }
  return null;
}

// ── Main multi-stage research pipeline ──────────────────────────

export async function gatherPersonResearchContext(opts: {
  name: string;
  email?: string;
  projectPrompt?: string;
  companyUrl?: string;
  searchDepth?: "basic" | "advanced" | "fast" | "ultra-fast";
  maxResultsPerQuery?: number;
  maxExtractUrls?: number;
}): Promise<PersonResearchContext> {
  const queries = buildPersonResearchQueries({
    name: opts.name,
    email: opts.email,
    projectPrompt: opts.projectPrompt,
    companyUrl: opts.companyUrl,
  });

  if (queries.general.length === 0 && queries.targeted.length === 0) {
    return {
      queries: [],
      searches: [],
      searchContext: "",
      extractedContext: "",
      sourceUrls: [],
      discoveredProfiles: {},
    };
  }

  const depth = opts.searchDepth ?? "advanced";
  const maxResults = opts.maxResultsPerQuery ?? 6;

  // ── Stage 1: Run general + domain-targeted searches in parallel ──
  const [generalSearches, ...targetedSearches] = await Promise.all([
    searchWebMulti(queries.general, {
      engine: getSearchEngine("person_research"),
      depth,
      maxResultsPerQuery: maxResults,
      maxTokens: 4000,
      chunksPerSource: 2,
    }),
    ...queries.targeted.map((t) =>
      searchWeb(t.query, {
        engine: getSearchEngine("person_research_targeted"),
        depth: "basic",
        maxResults: 4,
        includeDomains: t.domains,
        maxTokens: 3000,
        chunksPerSource: 2,
      })
    ),
  ]);

  const allSearches = [...generalSearches, ...targetedSearches];
  const allQueryStrings = [
    ...queries.general,
    ...queries.targeted.map((t) => `${t.query} [${t.domains.join(",")}]`),
  ];

  // ── Stage 2: Pick URLs with priority tiers and extract with more content ──
  const companyHost = parseHost(opts.companyUrl);
  const emailHost = getEmailHost(opts.email);
  const { priority: priorityUrls, secondary: secondaryUrls } = pickPersonResearchUrls(
    allSearches,
    { companyHost, emailHost, limit: opts.maxExtractUrls ?? 10 }
  );

  const extractQuery = [
    `Research the public professional background of ${opts.name}.`,
    "Prioritize biography, work history, public projects, writing, talks, and profile details.",
  ].join(" ");

  // Extract priority and secondary URLs in parallel with different chunk limits
  const [priorityExtracted, secondaryExtracted] = await Promise.all([
    priorityUrls.length > 0
      ? extractWeb(priorityUrls, {
          depth: "advanced",
          format: "markdown",
          chunksPerSource: 4,
          query: extractQuery,
        })
      : Promise.resolve({ results: [] as WebExtractResult[], failedResults: [] }),
    secondaryUrls.length > 0
      ? extractWeb(secondaryUrls, {
          depth: "advanced",
          format: "markdown",
          chunksPerSource: 3,
          query: extractQuery,
        })
      : Promise.resolve({ results: [] as WebExtractResult[], failedResults: [] }),
  ]);

  // ── Stage 3: Refinement search if we found company context ──
  const linkedinCompany = extractCompanyFromLinkedin(priorityExtracted.results);
  let refinementSearches: WebSearchResponse[] = [];

  if (linkedinCompany) {
    const refinement = await searchWeb(
      `"${opts.name}" "${linkedinCompany}"`,
      { engine: getSearchEngine("person_research_refinement"), depth: "basic", maxResults: 3, maxTokens: 2000 }
    );
    if (refinement.results.length > 0) {
      refinementSearches = [refinement];
    }
  }

  // ── Build output ──
  const discoveredProfiles: DiscoveredProfiles = {
    linkedinUrl: findLinkedInUrl(allSearches),
    githubUsername: findGitHubUsername(allSearches),
    twitterHandle: findTwitterHandle(allSearches),
    personalSite: findPersonalSite([...priorityExtracted.results, ...secondaryExtracted.results]),
  };

  const allSearchesWithRefinement = [...allSearches, ...refinementSearches];

  return {
    queries: allQueryStrings,
    searches: allSearchesWithRefinement,
    searchContext: formatSearchContext(allSearchesWithRefinement, 500),
    extractedContext: formatLabeledExtractContext(
      priorityExtracted.results,
      secondaryExtracted.results,
      2500,
      1400
    ),
    sourceUrls: [...priorityUrls, ...secondaryUrls],
    discoveredProfiles,
  };
}
