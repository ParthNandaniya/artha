import type { RegisteredTool, ToolDefinition, ToolExecutionContext, ToolExecutor } from "./types";
import { webSearchTool } from "./tools/web-search";
import { extractUrlTool } from "./tools/extract-url";
import { queryMemoryTool } from "./tools/query-memory";
import { updateMemoryTool } from "./tools/update-memory";
import { findSimilarTool } from "./tools/find-similar";
import { runSubAgentTool } from "./tools/run-sub-agent";

// ── Registry (immutable — never mutated at runtime) ──────────────

const TOOL_REGISTRY: Readonly<Record<string, RegisteredTool>> = {
  web_search: webSearchTool,
  extract_url: extractUrlTool,
  query_memory: queryMemoryTool,
  update_memory: updateMemoryTool,
  find_similar: findSimilarTool,
  run_sub_agent: runSubAgentTool,
};

/**
 * Get tool definitions for the Anthropic/OpenAI API.
 * Only returns definitions for the requested tool names.
 */
export function getToolDefinitions(toolNames: string[]): ToolDefinition[] {
  return toolNames
    .map((name) => TOOL_REGISTRY[name]?.definition)
    .filter((d): d is ToolDefinition => d != null);
}

/**
 * Per-execution tool overrides map. Keyed by tool name.
 * Used by AgenticRunner to inject scoped executors (e.g., run_sub_agent)
 * without mutating the global registry.
 */
export type ToolOverrides = Map<string, ToolExecutor>;

/**
 * Execute a tool by name with the given input and context.
 * Checks per-execution overrides first, then falls back to global registry.
 */
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolExecutionContext,
  overrides?: ToolOverrides,
): Promise<string> {
  // Check per-execution override first (scoped, no race condition)
  const override = overrides?.get(toolName);
  if (override) {
    return override(input, context);
  }

  const tool = TOOL_REGISTRY[toolName];
  if (!tool) {
    return `Unknown tool: "${toolName}". Available tools: ${Object.keys(TOOL_REGISTRY).join(", ")}`;
  }
  return tool.execute(input, context);
}

export { TOOL_REGISTRY };
