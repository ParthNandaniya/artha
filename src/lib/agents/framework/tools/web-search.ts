import { searchWeb, formatSearchContext } from "@/lib/search";
import type { RegisteredTool, ToolExecutionContext } from "../types";

export const webSearchTool: RegisteredTool = {
  definition: {
    name: "web_search",
    description:
      "Search the web for information. Use this to find current data about companies, markets, people, trends, competitors, or any topic. Returns formatted search results with titles, URLs, and content snippets.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query. Be specific and targeted for best results.",
        },
        engine: {
          type: "string",
          enum: ["exa", "brave", "tavily"],
          description:
            "Search engine to use. 'exa' for semantic/entity search (people, companies). 'brave' for broad web/news/trends. 'tavily' for general purpose. Default: auto-selected.",
        },
        max_results: {
          type: "number",
          description: "Max results to return (default: 5, max: 10).",
        },
      },
      required: ["query"],
    },
  },

  async execute(
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<string> {
    const query = input.query as string;
    const engine = input.engine as "exa" | "brave" | "tavily" | undefined;
    const maxResults = Math.min((input.max_results as number) || 5, 10);

    context.onProgress?.(`Searching web: "${query}"`);

    const response = await searchWeb(query, {
      engine,
      maxResults,
      depth: "basic",
    });

    if (!response || response.results.length === 0) {
      return `No results found for query: "${query}". Try a different search query.`;
    }

    // formatSearchContext expects WebSearchResponse[] (array of response objects)
    return formatSearchContext([response]);
  },
};
