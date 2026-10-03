import { ingestMemory, companyTag } from "@/lib/supermemory";
import type { RegisteredTool, ToolExecutionContext } from "../types";

export const updateMemoryTool: RegisteredTool = {
  definition: {
    name: "update_memory",
    description:
      "Store important findings or context into the company's semantic memory for future reference. Use this when you discover key insights, data points, or conclusions that should be remembered for future tasks.",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description:
            "The content to store. Write a concise, self-contained summary (max 500 words). Include key facts, numbers, and conclusions.",
        },
        label: {
          type: "string",
          description:
            "A short label for this memory (e.g., 'competitor_analysis', 'market_size_data', 'founder_background').",
        },
      },
      required: ["content", "label"],
    },
  },

  async execute(
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<string> {
    const content = input.content as string;
    const label = input.label as string;

    context.onProgress?.(`Saving to memory: ${label}`);

    const id = await ingestMemory({
      content: content.slice(0, 2200),
      containerTag: companyTag(context.projectId),
      customId: `${label}_${context.projectId}`,
      dedupeKey: `${label}:${context.projectId}`,
      metadata: { type: label },
      projectId: context.projectId,
    });

    return id
      ? `Successfully stored "${label}" in memory.`
      : "Memory storage skipped (duplicate or low-signal content).";
  },
};
