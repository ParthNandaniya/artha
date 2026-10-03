import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_SONNET } from "@/config/agent-models";
import type { ToolDefinition } from "@/lib/agents/framework/types";

// Re-use the existing Anthropic client singleton pattern
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export { anthropic };

// ── Types ───────────────────────────────────────────────────────────

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
  signature: string;
}

export type ContentBlock = ToolUseBlock | TextBlock | ThinkingBlock;

export interface AnthropicToolsMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface AnthropicToolsResponse {
  content: ContentBlock[];
  stopReason: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
}

export interface AnthropicToolsOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  tools?: ToolDefinition[];
  /** Enable extended thinking with the given token budget */
  thinking?: { budgetTokens: number };
}

// ── Core API call ───────────────────────────────────────────────────

export async function callAnthropicWithTools(
  systemPrompt: string,
  messages: AnthropicToolsMessage[],
  options: AnthropicToolsOptions = {},
): Promise<AnthropicToolsResponse> {
  const model = options.model || CLAUDE_SONNET;
  const maxTokens = options.maxTokens ?? 8192;

  // Build the request params
  const params: Anthropic.MessageCreateParams = {
    model,
    max_tokens: maxTokens,
    system: [
      {
        type: "text" as const,
        text: systemPrompt,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content as Anthropic.MessageCreateParams["messages"][number]["content"],
    })),
  };

  // Add tools if provided
  if (options.tools && options.tools.length > 0) {
    params.tools = options.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool["input_schema"],
    }));
  }

  // Extended thinking requires temperature=1 and special param
  if (options.thinking) {
    params.temperature = 1;
    (params as unknown as Record<string, unknown>).thinking = {
      type: "enabled",
      budget_tokens: options.thinking.budgetTokens,
    };
    // When thinking is enabled, max_tokens must be > budget_tokens
    if (maxTokens <= options.thinking.budgetTokens) {
      params.max_tokens = options.thinking.budgetTokens + maxTokens;
    }
  } else if (options.temperature != null) {
    params.temperature = options.temperature;
  }

  const response = await anthropic.messages.create(params);

  // Parse content blocks
  const content: ContentBlock[] = response.content.map((block) => {
    if (block.type === "text") {
      return { type: "text" as const, text: block.text };
    }
    if (block.type === "tool_use") {
      return {
        type: "tool_use" as const,
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      };
    }
    if (block.type === "thinking") {
      const tb = block as { type: "thinking"; thinking: string; signature: string };
      return {
        type: "thinking" as const,
        thinking: tb.thinking,
        signature: tb.signature,
      };
    }
    // Fallback for unknown block types
    return { type: "text" as const, text: "" };
  });

  return {
    content,
    stopReason: response.stop_reason ?? "end_turn",
    model: response.model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens: (response.usage as unknown as Record<string, number>).cache_creation_input_tokens,
      cacheReadInputTokens: (response.usage as unknown as Record<string, number>).cache_read_input_tokens,
    },
  };
}

// ── Helper: Build tool result message ───────────────────────────────

export function buildToolResultMessage(
  toolResults: { toolUseId: string; result: string; isError?: boolean }[],
): AnthropicToolsMessage {
  return {
    role: "user",
    content: toolResults.map((r) => ({
      type: "tool_result" as const,
      tool_use_id: r.toolUseId,
      content: r.result,
      ...(r.isError ? { is_error: true } : {}),
    })) as unknown as ContentBlock[],
  };
}

// ── Helper: Extract text from response ──────────────────────────────

export function extractTextFromResponse(content: ContentBlock[]): string {
  return content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

export function extractToolUseFromResponse(content: ContentBlock[]): ToolUseBlock[] {
  return content.filter((b): b is ToolUseBlock => b.type === "tool_use");
}

export function extractThinkingFromResponse(content: ContentBlock[]): string {
  return content
    .filter((b): b is ThinkingBlock => b.type === "thinking")
    .map((b) => b.thinking)
    .join("\n");
}
