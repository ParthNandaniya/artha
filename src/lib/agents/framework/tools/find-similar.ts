import { findSimilar, formatSearchContext } from "@/lib/search";
import type { RegisteredTool, ToolExecutionContext } from "../types";

export const findSimilarTool: RegisteredTool = {
  definition: {
    name: "find_similar",
    description:
      "Find websites and companies similar to a given URL. Use this for competitor discovery — provide a company's website URL and get back similar companies, products, or services.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to find similar sites/companies for.",
        },
        max_results: {
          type: "number",
          description: "Max results to return (default: 5, max: 10).",
        },
      },
      required: ["url"],
    },
  },

  async execute(
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<string> {
    const url = input.url as string;
    const maxResults = Math.min((input.max_results as number) || 5, 10);

    context.onProgress?.(`Finding companies similar to ${url}...`);

    const results = await findSimilar(url, { maxResults });

    if (!results || results.results.length === 0) {
      return `No similar sites found for ${url}.`;
    }

    // formatSearchContext expects WebSearchResponse[] — wrap the results
    return formatSearchContext([{ query: url, results: results.results }]);
  },
};
