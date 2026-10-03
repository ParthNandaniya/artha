import type { RuntimeToolDefinition } from "../types";

export const grepTool: RuntimeToolDefinition = {
  name: "Grep",
  description:
    "Search for a regex pattern across Artha resources. Scope with `path` — a specific path like 'site:index', or a glob like 'site:*' to search all pages. Output modes:\n" +
    "- 'files_with_matches' (default): list of matching resource paths\n" +
    "- 'content': matching lines with `context` lines around each\n" +
    "- 'count': match counts per resource\n" +
    "Regex uses JS syntax (not ripgrep). Good for finding things like '<h1' in site:index before editing.",
  input_schema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern to search for" },
      path: { type: "string", description: "Path or glob to limit the search. Omit to search all resources." },
      output_mode: {
        type: "string",
        enum: ["content", "files_with_matches", "count"],
        description: "default 'files_with_matches'",
      },
      context: { type: "number", description: "Lines of context around each match (content mode only)" },
      head_limit: { type: "number", description: "Max results returned (default 250)" },
    },
    required: ["pattern"],
  },
  readOnly: true,
  execute: async (input, ctx) => {
    const pattern = String(input.pattern);
    const path = typeof input.path === "string" ? input.path : undefined;
    const outputMode = (input.output_mode as "content" | "files_with_matches" | "count") || "files_with_matches";
    const context = typeof input.context === "number" ? input.context : undefined;
    const headLimit = typeof input.head_limit === "number" ? input.head_limit : undefined;
    try {
      const result = await ctx.workspace.grep(pattern, { path, outputMode, context, headLimit });
      return { content: result };
    } catch (err) {
      return { content: err instanceof Error ? err.message : String(err), isError: true };
    }
  },
};

export const globTool: RuntimeToolDefinition = {
  name: "Glob",
  description:
    "List resources matching a pattern. Examples:\n" +
    "- 'site:*' → all pages (site:index, site:pricing, etc.)\n" +
    "- 'tasks:*' → all tasks\n" +
    "- 'docs:*' → all docs\n" +
    "Always use Glob before assuming a resource path — the project may have custom pages.",
  input_schema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Path pattern e.g. 'site:*'" },
    },
    required: ["pattern"],
  },
  readOnly: true,
  execute: async (input, ctx) => {
    const pattern = String(input.pattern);
    try {
      const list = await ctx.workspace.list(pattern);
      return { content: list.length > 0 ? list.join("\n") : "(no matching resources)" };
    } catch (err) {
      return { content: err instanceof Error ? err.message : String(err), isError: true };
    }
  },
};
