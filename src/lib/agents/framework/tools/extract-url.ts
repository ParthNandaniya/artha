import { extractWeb } from "@/lib/search";
import type { RegisteredTool, ToolExecutionContext } from "../types";

export const extractUrlTool: RegisteredTool = {
  definition: {
    name: "extract_url",
    description:
      "Extract and read the full content from one or more URLs. Use this when you find a relevant URL from search results and need to read the full article, page, or document content.",
    input_schema: {
      type: "object",
      properties: {
        urls: {
          type: "array",
          items: { type: "string" },
          description: "One or more URLs to extract content from (max 5).",
        },
        query: {
          type: "string",
          description: "Optional context query to help focus content extraction.",
        },
      },
      required: ["urls"],
    },
  },

  async execute(
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<string> {
    const urls = (input.urls as string[]).slice(0, 5);
    const query = input.query as string | undefined;

    context.onProgress?.(`Reading ${urls.length} page(s)...`);

    const results = await extractWeb(urls, {
      depth: "basic",
      query,
    });

    if (!results || results.results.length === 0) {
      return "Could not extract content from the provided URLs.";
    }

    return results.results
      .map((r) => {
        const title = r.title || r.url;
        const content = r.rawContent?.slice(0, 8000) || "No content extracted.";
        return `━━━ ${title} ━━━\nURL: ${r.url}\n${content}`;
      })
      .join("\n\n");
  },
};
