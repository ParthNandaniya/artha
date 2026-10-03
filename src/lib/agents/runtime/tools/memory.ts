import { companyTag, getRelevantContext, ingestMemory } from "@/lib/supermemory";
import type { RuntimeToolDefinition } from "../types";

export const memorySearchTool: RuntimeToolDefinition = {
  name: "MemorySearch",
  description:
    "Search the project's persistent semantic memory (past research, mission context, conversation history, analytics digests). Returns the most relevant memories up to the specified limit. Use this to ground your answers in what the project already knows before doing fresh web research.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "number", description: "default 6" },
    },
    required: ["query"],
  },
  readOnly: true,
  execute: async (input, ctx) => {
    const query = String(input.query);
    const limit = typeof input.limit === "number" ? input.limit : 6;
    try {
      const content = await getRelevantContext({
        query,
        containerTag: companyTag(ctx.session.projectId),
        limit,
        threshold: 0.4,
      });
      ctx.credits.chargeOperation("memory_search");
      return { content: content || "(no relevant memories found)" };
    } catch (err) {
      return { content: err instanceof Error ? err.message : String(err), isError: true };
    }
  },
};

export const memoryWriteTool: RuntimeToolDefinition = {
  name: "MemoryWrite",
  description:
    "Save a durable fact to the project's persistent memory so future conversations can recall it. Use for insights worth remembering long-term — user preferences, founder background, strategic decisions, research findings. Do NOT use for ephemeral chat state or things better stored in the project DB.",
  input_schema: {
    type: "object",
    properties: {
      content: { type: "string", description: "The fact/insight to remember (1-3 sentences)" },
      dedupe_key: { type: "string", description: "Stable key so repeated saves overwrite instead of duplicate" },
      tag: { type: "string", description: "Optional category like 'research', 'preference', 'strategy'" },
    },
    required: ["content"],
  },
  execute: async (input, ctx) => {
    const content = String(input.content);
    const dedupeKey = typeof input.dedupe_key === "string" ? input.dedupe_key : undefined;
    const tag = typeof input.tag === "string" ? input.tag : "chat_agent";
    try {
      const id = await ingestMemory({
        content,
        containerTag: companyTag(ctx.session.projectId),
        customId: dedupeKey,
        dedupeKey,
        projectId: ctx.session.projectId,
        userId: ctx.session.userId,
        metadata: { type: tag, source: "chat_agent" },
      });
      ctx.credits.chargeOperation("memory_write");
      return { content: JSON.stringify({ saved: true, memoryId: id }) };
    } catch (err) {
      return { content: err instanceof Error ? err.message : String(err), isError: true };
    }
  },
};
