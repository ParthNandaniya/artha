import { extractWeb, findSimilar, searchWeb } from "@/lib/search";
import type { RuntimeToolDefinition } from "../types";

export const webSearchTool: RuntimeToolDefinition = {
  name: "WebSearch",
  description:
    "Search the web. Use engine='neural' for semantic/concept queries (best for finding similar companies, people, ideas). Use engine='keyword' for literal keyword searches (best for news, trends, specific terms). 'auto' picks based on the query.\n\nReturns title, url, and snippet for each result. Follow up with WebFetch to get full content for a specific URL.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      engine: { type: "string", enum: ["neural", "keyword", "auto"], description: "default 'auto'" },
      num_results: { type: "number", description: "default 5, max 10" },
      include_domains: { type: "array", items: { type: "string" }, description: "Only include these domains" },
      exclude_domains: { type: "array", items: { type: "string" } },
    },
    required: ["query"],
  },
  execute: async (input, ctx) => {
    const query = String(input.query);
    const engine = (input.engine as "neural" | "keyword" | "auto" | undefined) || "auto";
    const maxResults = Math.min(typeof input.num_results === "number" ? input.num_results : 5, 10);
    const engineArg = engine === "neural" ? "exa" : engine === "keyword" ? "brave" : "auto";

    try {
      const response = await searchWeb(query, {
        engine: engineArg,
        maxResults,
        includeDomains: Array.isArray(input.include_domains) ? (input.include_domains as string[]) : undefined,
        excludeDomains: Array.isArray(input.exclude_domains) ? (input.exclude_domains as string[]) : undefined,
      });

      ctx.credits.chargeOperation(engine === "keyword" ? "web_search_keyword" : "web_search_neural");

      if (response.results.length === 0) {
        return { content: "(no results)" };
      }

      const formatted = response.results.map((r, i) => {
        const snippet = (r.content || "").slice(0, 400).replace(/\s+/g, " ").trim();
        return `${i + 1}. ${r.title || "(untitled)"}\n   ${r.url}\n   ${snippet}`;
      });

      const answer = response.answer ? `Summary: ${response.answer}\n\n` : "";
      return { content: answer + formatted.join("\n\n") };
    } catch (err) {
      return { content: err instanceof Error ? err.message : String(err), isError: true };
    }
  },
};

export const webFetchTool: RuntimeToolDefinition = {
  name: "WebFetch",
  description:
    "Fetch and extract readable content from a URL. Returns the page text (up to ~4000 chars). Use after WebSearch to dive deep on a specific result.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string" },
    },
    required: ["url"],
  },
  execute: async (input, ctx) => {
    const url = String(input.url);
    try {
      const result = await extractWeb([url], { depth: "basic", format: "markdown" });
      ctx.credits.chargeOperation("web_fetch");
      if (result.results.length === 0) {
        const failed = result.failedResults[0];
        return { content: failed ? `Failed to fetch ${url}: ${failed.error}` : `No content extracted from ${url}`, isError: true };
      }
      const content = (result.results[0].rawContent || "").slice(0, 4000);
      return { content: `# ${result.results[0].title || url}\nURL: ${url}\n\n${content}` };
    } catch (err) {
      return { content: err instanceof Error ? err.message : String(err), isError: true };
    }
  },
};

export const findSimilarTool: RuntimeToolDefinition = {
  name: "FindSimilar",
  description: "Find pages semantically similar to a URL. Useful for finding competitors given one known competitor.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string" },
      num_results: { type: "number", description: "default 5" },
    },
    required: ["url"],
  },
  execute: async (input, ctx) => {
    const url = String(input.url);
    const maxResults = typeof input.num_results === "number" ? input.num_results : 5;
    try {
      const result = await findSimilar(url, { maxResults });
      ctx.credits.chargeOperation("find_similar");
      if (result.results.length === 0) return { content: "(no similar pages found)" };
      const lines = result.results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`);
      return { content: lines.join("\n") };
    } catch (err) {
      return { content: err instanceof Error ? err.message : String(err), isError: true };
    }
  },
};
