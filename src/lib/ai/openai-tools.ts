/**
 * OpenAI function-calling (tool use) implementation.
 * Mirrors the interface of anthropic-tools.ts so the agentic runner
 * can swap providers without any changes to tool execution logic.
 */

import type OpenAI from "openai";
import { getOpenAIClient, isReasoningModel } from "@/lib/openai";
import type { ToolDefinition } from "@/lib/agents/framework/types";
import type {
  AnthropicToolsMessage as ToolUseMessage,
  AnthropicToolsResponse as ToolUseResponse,
  AnthropicToolsOptions as ToolUseOptions,
  ContentBlock,
} from "./anthropic-tools";

// ── Format converters ────────────────────────────────────────────────

/** Convert framework tool definitions to OpenAI function-calling format */
function toOpenAITools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as OpenAI.FunctionParameters,
    },
  }));
}

/**
 * Convert provider-agnostic messages to OpenAI chat completion format.
 * Handles:
 *  - Plain string user/assistant messages
 *  - Assistant messages with tool_use content blocks → tool_calls
 *  - User messages with tool_result content blocks → role: "tool" messages
 *  - Thinking blocks (skipped — Anthropic-only)
 */
function toOpenAIMessages(
  systemPrompt: string,
  messages: ToolUseMessage[],
): OpenAI.ChatCompletionMessageParam[] {
  const out: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of messages) {
    // Plain string content
    if (typeof msg.content === "string") {
      out.push({ role: msg.role as "user" | "assistant", content: msg.content });
      continue;
    }

    // Array of content blocks
    if (msg.role === "assistant") {
      // Extract text and tool_use blocks
      const textParts: string[] = [];
      const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = [];

      for (const block of msg.content) {
        if (block.type === "text") {
          textParts.push(block.text);
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            type: "function",
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input),
            },
          });
        }
        // Skip thinking blocks — Anthropic-only
      }

      const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
        role: "assistant",
        content: textParts.join("\n") || null,
      };
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls;
      }
      out.push(assistantMsg);
    } else {
      // User message with content blocks — check for tool_result
      const toolResults: Array<{ tool_use_id: string; content: string }> = [];
      const textParts: string[] = [];

      for (const block of msg.content) {
        if (block.type === "text") {
          textParts.push(block.text);
        } else {
          // tool_result blocks (cast since they're stored as unknown ContentBlock)
          const b = block as unknown as { type: string; tool_use_id?: string; content?: string };
          if (b.type === "tool_result" && b.tool_use_id) {
            toolResults.push({ tool_use_id: b.tool_use_id, content: b.content || "" });
          }
        }
      }

      // Tool results become separate "tool" role messages in OpenAI
      if (toolResults.length > 0) {
        for (const r of toolResults) {
          out.push({
            role: "tool",
            tool_call_id: r.tool_use_id,
            content: r.content,
          });
        }
      }

      // Any remaining text goes as a user message
      if (textParts.length > 0) {
        out.push({ role: "user", content: textParts.join("\n") });
      }
    }
  }

  return out;
}

// ── Core API call ────────────────────────────────────────────────────

export async function callOpenAIWithTools(
  systemPrompt: string,
  messages: ToolUseMessage[],
  options: ToolUseOptions = {},
): Promise<ToolUseResponse> {
  const openai = getOpenAIClient();
  const model = options.model || "gpt-4o";
  const maxTokens = options.maxTokens ?? 8192;
  const reasoning = isReasoningModel(model);

  // Build request params
  const params: OpenAI.ChatCompletionCreateParams = {
    model,
    messages: toOpenAIMessages(systemPrompt, messages),
    max_completion_tokens: reasoning ? Math.max(maxTokens * 2, 8192) : maxTokens,
    ...(options.temperature != null && !reasoning
      ? { temperature: options.temperature }
      : {}),
  };

  // Add tools if provided
  if (options.tools && options.tools.length > 0) {
    params.tools = toOpenAITools(options.tools);
  }

  // options.thinking is Anthropic-only — silently ignored

  const response = await openai.chat.completions.create(params);

  const choice = response.choices[0];
  if (!choice) {
    return {
      content: [{ type: "text", text: "" }],
      stopReason: "end_turn",
      model: response.model,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  const msg = choice.message;

  // Normalize response to common ContentBlock[] format
  const content: ContentBlock[] = [];

  if (msg.content) {
    content.push({ type: "text", text: msg.content });
  }

  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      if (tc.type !== "function") continue;
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(tc.function.arguments);
      } catch {
        // Malformed arguments — pass as raw string so tool execution can fail gracefully
        input = { _raw: tc.function.arguments };
      }
      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input,
      });
    }
  }

  // If no content at all, add empty text block
  if (content.length === 0) {
    content.push({ type: "text", text: "" });
  }

  // Map finish_reason
  let stopReason: string;
  switch (choice.finish_reason) {
    case "tool_calls":
      stopReason = "tool_use";
      break;
    case "stop":
      stopReason = "end_turn";
      break;
    case "length":
      stopReason = "max_tokens";
      break;
    default:
      stopReason = choice.finish_reason ?? "end_turn";
  }

  return {
    content,
    stopReason,
    model: response.model,
    usage: {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    },
  };
}
