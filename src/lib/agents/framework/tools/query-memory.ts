import { getRelevantContext, companyTag } from "@/lib/supermemory";
import type { RegisteredTool, ToolExecutionContext } from "../types";

export const queryMemoryTool: RegisteredTool = {
  definition: {
    name: "query_memory",
    description:
      "Search the company's semantic memory for relevant context. Use this to recall previous research, documents, decisions, conversations, and background information about the company. Returns relevant context passages.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "What to search for in memory. Be specific — e.g., 'competitor pricing analysis' or 'founder background and experience'.",
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

    context.onProgress?.(`Recalling: "${query}"`);

    const result = await getRelevantContext({
      query,
      containerTag: companyTag(context.projectId),
      limit: 5,
      threshold: 0.4,
    });

    if (!result || result.trim().length === 0) {
      return "No relevant context found in memory for this query.";
    }

    return result;
  },
};
