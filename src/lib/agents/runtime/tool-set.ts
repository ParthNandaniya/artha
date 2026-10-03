import type { RuntimeToolDefinition } from "./types";
import { editTool, readTool, writeTool } from "./tools/read-edit-write";
import { globTool, grepTool } from "./tools/grep-glob";
import { findSimilarTool, webFetchTool, webSearchTool } from "./tools/web";
import { todoWriteTool } from "./tools/todo";
import { memorySearchTool, memoryWriteTool } from "./tools/memory";

export const MAIN_TOOLS: RuntimeToolDefinition[] = [
  readTool,
  editTool,
  writeTool,
  grepTool,
  globTool,
  webSearchTool,
  webFetchTool,
  findSimilarTool,
  todoWriteTool,
  memorySearchTool,
  memoryWriteTool,
];

export function toolMap(tools: RuntimeToolDefinition[]): Map<string, RuntimeToolDefinition> {
  const map = new Map<string, RuntimeToolDefinition>();
  for (const tool of tools) map.set(tool.name, tool);
  return map;
}
