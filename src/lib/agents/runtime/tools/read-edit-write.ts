import type { RuntimeToolDefinition } from "../types";

export const readTool: RuntimeToolDefinition = {
  name: "Read",
  description:
    "Read an Artha resource by path. Resources available:\n" +
    "- 'site:index' (main landing page), 'site:{slug}' (extra pages)\n" +
    "- 'docs:mission' (mission doc)\n" +
    "- 'tasks:' (task list), 'tasks:{id}' (single task)\n" +
    "- 'emails:recent' (recent sends), 'emails:{id}' (single)\n" +
    "- 'leads:' (lead list), 'leads:{id}' (single)\n" +
    "- 'analytics:summary' (site analytics)\n" +
    "- 'contacts:' (email capture contacts)\n" +
    "- 'memory:{query}' (semantic memory search)\n" +
    "Content is returned with line numbers (like cat -n). Use offset/limit for large resources — default limit is 2000 lines.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Resource path, e.g. 'site:index'." },
      offset: { type: "number", description: "0-indexed starting line. Omit to read from the top." },
      limit: { type: "number", description: "Max lines to return (default 2000)." },
    },
    required: ["path"],
  },
  readOnly: true,
  execute: async (input, ctx) => {
    const path = String(input.path);
    const offset = typeof input.offset === "number" ? input.offset : undefined;
    const limit = typeof input.limit === "number" ? input.limit : undefined;
    try {
      const content = await ctx.workspace.read(path, { offset, limit });
      return { content: content || "(empty)" };
    } catch (err) {
      return { content: errorMsg(err), isError: true };
    }
  },
};

export const editTool: RuntimeToolDefinition = {
  name: "Edit",
  description:
    "Replace a unique string in a resource. `old_string` MUST match exactly one place in the file — include surrounding whitespace/context to disambiguate. Set `replace_all: true` to replace every occurrence. Fails clearly if old_string isn't unique or isn't found. You must Read the resource first to know the exact current content.\n\nOnly 'site:*' paths are editable in this version.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Target resource path" },
      old_string: { type: "string", description: "Exact text to replace" },
      new_string: { type: "string", description: "Replacement text" },
      replace_all: { type: "boolean", description: "Replace every occurrence (default false)" },
    },
    required: ["path", "old_string", "new_string"],
  },
  execute: async (input, ctx) => {
    const path = String(input.path);
    const oldString = String(input.old_string);
    const newString = String(input.new_string);
    const replaceAll = Boolean(input.replace_all);
    try {
      await ctx.workspace.edit(path, oldString, newString, replaceAll);
      const diff = ctx.workspace.diffSummary().find((d) => d.path === path);
      return {
        content: JSON.stringify({
          applied: true,
          path,
          changeType: diff?.changeType || "modified",
          bytes: diff?.bytes ?? 0,
        }),
      };
    } catch (err) {
      return { content: errorMsg(err), isError: true };
    }
  },
};

export const writeTool: RuntimeToolDefinition = {
  name: "Write",
  description:
    "Create a new resource or completely overwrite an existing one. Prefer Edit for modifying existing resources — use Write only when the entire content is changing or the resource doesn't exist yet. You must Read the resource first if it exists before using Write.\n\nOnly 'site:*' paths support Write. Creating a new page: Write('site:pricing', fullHtml).",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
  },
  execute: async (input, ctx) => {
    const path = String(input.path);
    const content = String(input.content);
    try {
      await ctx.workspace.write(path, content);
      const diff = ctx.workspace.diffSummary().find((d) => d.path === path);
      return {
        content: JSON.stringify({
          written: true,
          path,
          changeType: diff?.changeType || "modified",
          bytes: diff?.bytes ?? content.length,
        }),
      };
    } catch (err) {
      return { content: errorMsg(err), isError: true };
    }
  },
};

function errorMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
