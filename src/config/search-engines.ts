import type { SearchEngine } from "@/lib/search";

/**
 * Search task names — each represents a distinct search use case in the app.
 * Used to route queries to the best search engine per task.
 */
export type SearchTaskName =
  | "person_research"
  | "person_research_targeted"
  | "person_research_refinement"
  | "lead_research"
  | "lead_finder"
  | "market_research"
  | "market_research_similar"
  | "idea_research"
  | "general_research";

export interface SearchEngineConfig {
  /** Which engine to use: "exa" | "brave" | "tavily" | "auto" */
  engine: SearchEngine;
  /** Brief explanation for why this engine was chosen */
  reason: string;
}

/**
 * Centralized search engine routing for ALL web search tasks.
 *
 * Available engines:
 *   - "exa"    (semantic/neural):  Entity search — people, companies, profiles, leads
 *   - "brave"  (keyword):          Market data — trends, news, market size, competitors
 *   - "tavily" (hybrid):           General-purpose search + deep content extraction
 *   - "auto"                       Let the search module decide based on query shape
 *
 * To switch providers, change the engine value here — it applies everywhere.
 * For example, to move all searches to Tavily, set every engine to "tavily".
 */
export const SEARCH_ENGINE_CONFIG: Record<SearchTaskName, SearchEngineConfig> = {
  // ── Person research (Exa — semantic person/entity discovery) ──
  person_research:            { engine: "exa",   reason: "Neural search finds people by meaning, not just keywords" },
  person_research_targeted:   { engine: "exa",   reason: "Domain-targeted queries (LinkedIn, GitHub) work natively with Exa includeDomains" },
  person_research_refinement: { engine: "exa",   reason: "Quoted name + company refinement is a semantic entity query" },

  // ── Lead discovery (Exa — semantic company/people finding) ──
  lead_research:              { engine: "exa",   reason: "Finding specific companies and decision-makers by role/fit" },
  lead_finder:                { engine: "exa",   reason: "Aggressive lead hunting — neural search for entity discovery" },

  // ── Market research (Brave — keyword breadth for trends/data) ──
  market_research:            { engine: "brave", reason: "Broad keyword coverage for market size, trends, competitor news" },
  market_research_similar:    { engine: "exa",   reason: "Exa findSimilar for competitor discovery from a company URL" },

  // ── General (Brave — fastest, broadest web coverage) ──
  idea_research:              { engine: "brave", reason: "Keyword search for competitive landscape and market validation" },
  general_research:           { engine: "brave", reason: "Broadest web coverage for open-ended research queries" },
};

export function getSearchEngineConfig(task: SearchTaskName): SearchEngineConfig {
  return SEARCH_ENGINE_CONFIG[task];
}

export function getSearchEngine(task: SearchTaskName): SearchEngine {
  return SEARCH_ENGINE_CONFIG[task].engine;
}
