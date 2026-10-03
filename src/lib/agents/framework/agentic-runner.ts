import {
  callAnthropicWithTools,
  buildToolResultMessage,
  extractTextFromResponse,
  extractToolUseFromResponse,
  extractThinkingFromResponse,
  type AnthropicToolsMessage,
  type AnthropicToolsOptions,
} from "@/lib/ai/anthropic-tools";
import { callOpenAIWithTools } from "@/lib/ai/openai-tools";
import { getToolDefinitions, executeTool, type ToolOverrides } from "./tool-registry";
import { AuditTrail } from "./audit-trail";
import type {
  AgenticRunnerInput,
  AgenticRunnerOutput,
  AgenticConfig,
  AgenticOverrides,
  ToolExecutionContext,
  ValidationResult,
} from "./types";
import type { AgentOutput } from "../types";
import { getAgentModelConfig } from "@/config/agent-models";
import { isRetryableProviderError } from "@/lib/ai/agent-model-router";
import type { ModelTaskName } from "@/lib/types";

// ── Config merging ──────────────────────────────────────────────────

function mergeConfig(base: AgenticConfig, overrides?: AgenticOverrides): AgenticConfig {
  if (!overrides) return base;
  const merged = { ...base };
  if (overrides.maxIterations != null) merged.maxIterations = overrides.maxIterations;
  if (overrides.thinkingBudget != null) merged.thinkingBudget = overrides.thinkingBudget;
  if (overrides.maxRetries != null) merged.maxRetries = overrides.maxRetries;
  if (overrides.maxSubAgents != null) merged.maxSubAgents = overrides.maxSubAgents;
  if (overrides.useExtendedThinking != null) merged.useExtendedThinking = overrides.useExtendedThinking;
  if (overrides.timeoutMs != null) merged.timeoutMs = overrides.timeoutMs;
  if (overrides.qualityThreshold != null && merged.validationCriteria?.quality) {
    merged.validationCriteria = {
      ...merged.validationCriteria,
      quality: { ...merged.validationCriteria.quality, threshold: overrides.qualityThreshold },
    };
  }
  return merged;
}

// ── JSON extraction from text ───────────────────────────────────────

function extractJSON(text: string): Record<string, unknown> | null {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // noop
  }

  // Find JSON block in text (between ``` or between { })
  const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    // noop
  }

  // Find the outermost balanced { ... } block using brace counting
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

// ── Output parsing ──────────────────────────────────────────────────

function parseAgentOutput(text: string, agentName: string): AgentOutput {
  // Try to parse as JSON (agents may return structured output)
  const json = extractJSON(text);
  if (json) {
    // If the JSON has title+content at top level (research/lead agents) but no documents array,
    // wrap it into a document so downstream code (supermemory ingestion, scratchpad) can find it.
    let documents = json.documents as AgentOutput["documents"];
    if (!documents && json.title && json.content) {
      documents = [{
        type: "output",
        title: json.title as string,
        content: json.content as string,
        metadata: {
          ...(json.keyFindings ? { keyFindings: json.keyFindings } : {}),
          ...(json.entities ? { entities: json.entities } : {}),
          ...(json.leads ? { leads: json.leads } : {}),
        },
      }];
    }

    return {
      success: true,
      agent: agentName as AgentOutput["agent"],
      summary: (json.summary as string) || text.slice(0, 200),
      documents,
      memoryUpdates: json.memoryUpdates as AgentOutput["memoryUpdates"],
      supermemoryIngestions: json.supermemoryIngestions as AgentOutput["supermemoryIngestions"],
      tasksCreated: json.tasksCreated as AgentOutput["tasksCreated"],
      emails: json.emails as AgentOutput["emails"],
      tweets: json.tweets as AgentOutput["tweets"],
      pages: json.pages as AgentOutput["pages"],
      leads: json.leads as AgentOutput["leads"],
      links: json.links as AgentOutput["links"],
      schemaOperations: json.schemaOperations as AgentOutput["schemaOperations"],
    };
  }

  // Fallback: treat entire text as the output content
  return {
    success: true,
    agent: agentName as AgentOutput["agent"],
    summary: text.slice(0, 200),
    documents: [{ type: "output", title: "Agent Output", content: text }],
  };
}

// ── Stall detection ─────────────────────────────────────────────────

function detectStall(
  previousToolCalls: string[],
  currentToolCalls: string[],
): boolean {
  if (previousToolCalls.length === 0 || currentToolCalls.length === 0) return false;
  if (previousToolCalls.length !== currentToolCalls.length) return false;
  return previousToolCalls.every((call, i) => call === currentToolCalls[i]);
}

// ── Context window management ───────────────────────────────────────
// Estimate token count for a message array and trim old tool results
// if the conversation is getting too large. Keeps first (system context)
// and last (recent) messages, summarises/drops middle tool results.

const DEFAULT_MAX_ESTIMATED_TOKENS = 80_000; // conservative — leaves headroom for output
const DEFAULT_MAX_TOOL_RESULT_CHARS = 8_000;
const CHARS_PER_TOKEN = 4; // rough estimate

function estimateTokens(messages: AnthropicToolsMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    if (typeof m.content === "string") {
      chars += m.content.length;
    } else if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if ("text" in block && typeof block.text === "string") chars += block.text.length;
        else if ("content" in block && typeof block.content === "string") chars += block.content.length;
        else chars += JSON.stringify(block).length;
      }
    }
  }
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

function trimMessages(messages: AnthropicToolsMessage[], maxTokens: number): AnthropicToolsMessage[] {
  if (estimateTokens(messages) <= maxTokens) return messages;

  // Strategy: keep first message (user task) and last 6 messages (recent context).
  // For middle messages, summarize tool_result content blocks to 300 chars instead of dropping.
  if (messages.length <= 8) return messages; // too few to trim

  const first = messages[0];
  const last6 = messages.slice(-6);
  const middle = messages.slice(1, -6);

  const trimmedMiddle: AnthropicToolsMessage[] = middle.map((m) => {
    if (m.role === "user" && typeof m.content === "string" && m.content.length > 800) {
      return { ...m, content: m.content.slice(0, 300) + "\n...[earlier tool result summarized]" };
    }
    if (m.role === "user" && Array.isArray(m.content)) {
      // Summarize individual tool_result content blocks
      const summarized = m.content.map((block) => {
        if ("content" in block && typeof (block as { content?: string }).content === "string") {
          const content = (block as { content: string }).content;
          if (content.length > 500) {
            return { ...block, content: content.slice(0, 300) + "\n...[earlier tool result summarized]" };
          }
        }
        return block;
      });
      return { ...m, content: summarized as typeof m.content };
    }
    return m;
  });

  return [first, ...trimmedMiddle, ...last6];
}

// ── Per-tool timeout wrapper ────────────────────────────────────────

const PER_TOOL_TIMEOUT_MS = 15_000; // 15s per individual tool call

async function executeToolWithTimeout(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolExecutionContext,
  overrides?: ToolOverrides,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PER_TOOL_TIMEOUT_MS);

  try {
    const result = await Promise.race([
      executeTool(toolName, input, context, overrides),
      new Promise<string>((_, reject) => {
        controller.signal.addEventListener("abort", () =>
          reject(new Error(`Tool "${toolName}" timed out after ${PER_TOOL_TIMEOUT_MS / 1000}s`)),
        );
      }),
    ]);
    return result;
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Main Runner ─────────────────────────────────────────────────────

export async function runAgentic(
  input: AgenticRunnerInput,
  /** Optional: validation function injected by the caller */
  validate?: (output: AgentOutput, config: AgenticConfig) => Promise<ValidationResult>,
  /** Optional: sub-agent executor injected by the caller */
  subAgentExecutor?: (agent: string, prompt: string, context: ToolExecutionContext) => Promise<string>,
): Promise<AgenticRunnerOutput> {
  const startTime = Date.now();
  const config = mergeConfig(input.config, input.overrides);
  const auditTrail = new AuditTrail();
  const onProgress = input.agentInput.onProgress;

  // Resolve provider and model from config, with fallback support
  const agentModelConfig = getAgentModelConfig(config.agent as ModelTaskName);
  const provider = input.provider ?? agentModelConfig.provider;
  const model = input.model ?? agentModelConfig.model;
  const fallbackConfig = agentModelConfig.fallback;

  /** Call the LLM via the configured provider, with automatic fallback on provider errors */
  async function callLLM(
    systemPrompt: string,
    msgs: AnthropicToolsMessage[],
    opts: AnthropicToolsOptions,
  ) {
    const call = (p: "openai" | "anthropic", m: string) => {
      const callOpts = { ...opts, model: m };
      return p === "openai"
        ? callOpenAIWithTools(systemPrompt, msgs, callOpts)
        : callAnthropicWithTools(systemPrompt, msgs, callOpts);
    };

    try {
      return await call(provider, model);
    } catch (err) {
      if (isRetryableProviderError(err) && fallbackConfig) {
        console.warn(`[agentic-runner] ${provider}/${model} unavailable, falling back to ${fallbackConfig.provider}/${fallbackConfig.model}`);
        return call(fallbackConfig.provider, fallbackConfig.model);
      }
      throw err;
    }
  }

  // Build tool execution context
  const toolContext: ToolExecutionContext = {
    projectId: input.agentInput.projectId,
    userId: input.agentInput.userId,
    scratchpad: input.agentInput.scratchpad,
    auditTrail,
    onProgress,
    depth: (input.agentInput.metadata?.agenticDepth as number) ?? 0,
    creditsRemaining: input.agentInput.metadata?.creditsRemaining as number | undefined,
  };

  // Per-execution tool overrides (scoped — no global mutation / race conditions)
  const toolOverrides: ToolOverrides = new Map();
  let subAgentCount = 0;

  if (subAgentExecutor && config.maxSubAgents > 0 && toolContext.depth < 1) {
    const originalSubAgent = subAgentExecutor;
    toolOverrides.set("run_sub_agent", async (
      toolInput: Record<string, unknown>,
      ctx: ToolExecutionContext,
    ): Promise<string> => {
      if (subAgentCount >= config.maxSubAgents) {
        return `Cannot spawn more sub-agents. Limit reached (${config.maxSubAgents}). Complete your task with the information you already have.`;
      }
      subAgentCount++;
      const agent = toolInput.agent as string;
      const prompt = toolInput.prompt as string;

      auditTrail.log({
        type: "sub_agent_start",
        agent: config.agent,
        data: { subAgent: agent as AgentOutput["agent"], message: prompt.slice(0, 200) },
      });

      onProgress?.(`Spawning ${agent} sub-agent...`);
      const result = await originalSubAgent(agent, prompt, ctx);

      auditTrail.log({
        type: "sub_agent_done",
        agent: config.agent,
        data: { subAgent: agent as AgentOutput["agent"], message: result.slice(0, 200) },
      });

      return result;
    });
  }

  // Get tool definitions for this agent
  const toolDefs = getToolDefinitions(config.tools);

  // Build initial messages
  const scratchpadContext = input.agentInput.scratchpad?.toContextString() || "";
  const fullContext = [input.context, scratchpadContext].filter(Boolean).join("\n\n");

  const userContent = fullContext
    ? `${fullContext}\n\n━━━ YOUR TASK ━━━\n${input.userPrompt}`
    : input.userPrompt;

  let messages: AnthropicToolsMessage[] = [
    { role: "user", content: userContent },
  ];

  // Track token usage
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalThinkingTokens = 0;
  let iterations = 0;
  let retries = 0;
  let lastOutput: AgentOutput | null = null;
  let validationPassed = true;

  // ── ReAct Loop ──────────────────────────────────────────────────
  const maxAttempts = config.maxRetries + 1; // 1 initial + N retries

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let previousToolCalls: string[] = [];
    iterations = 0;

    // Tool-use loop within each attempt
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Timeout check
      if (config.timeoutMs && Date.now() - startTime > config.timeoutMs) {
        auditTrail.log({
          type: "error",
          agent: config.agent,
          data: { error: "Execution timeout reached", durationMs: Date.now() - startTime },
        });
        break;
      }

      // Trim messages if context window is getting large
      const maxTokens = config.maxEstimatedTokens ?? DEFAULT_MAX_ESTIMATED_TOKENS;
      messages = trimMessages(messages, maxTokens);

      // Call the LLM via configured provider
      const response = await callLLM(
        input.systemPrompt,
        messages,
        {
          maxTokens: 8192,
          tools: toolDefs.length > 0 ? toolDefs : undefined,
          thinking: provider === "anthropic" && config.useExtendedThinking && config.thinkingBudget
            ? { budgetTokens: config.thinkingBudget }
            : undefined,
        },
      );

      // Track tokens
      totalInputTokens += response.usage.inputTokens;
      totalOutputTokens += response.usage.outputTokens;

      // Log thinking content if present
      const thinking = extractThinkingFromResponse(response.content);
      if (thinking) {
        // Estimate thinking tokens (rough: ~4 chars per token)
        const estimatedThinkingTokens = Math.ceil(thinking.length / 4);
        totalThinkingTokens += estimatedThinkingTokens;
        auditTrail.log({
          type: "thinking",
          agent: config.agent,
          data: {
            thinkingContent: thinking,
            tokenUsage: { input: 0, output: 0, thinking: estimatedThinkingTokens },
          },
        });
      }

      // Log LLM response
      auditTrail.log({
        type: "llm_response",
        agent: config.agent,
        data: {
          llmModel: response.model,
          tokenUsage: {
            input: response.usage.inputTokens,
            output: response.usage.outputTokens,
          },
          message: `stop_reason: ${response.stopReason}`,
        },
      });

      // Check for tool use
      const toolUseBlocks = extractToolUseFromResponse(response.content);

      if (toolUseBlocks.length === 0 || iterations >= config.maxIterations) {
        // No more tool calls or max iterations reached — extract final response
        let text = extractTextFromResponse(response.content);

        // Add assistant message to history
        messages.push({ role: "assistant", content: response.content });

        // If we hit max iterations but the response still has tool_use blocks,
        // add dummy tool_result blocks so the message history stays valid for
        // any subsequent API calls (e.g. validation retries).
        if (toolUseBlocks.length > 0) {
          messages.push(
            buildToolResultMessage(
              toolUseBlocks.map((t) => ({
                toolUseId: t.id,
                result: "Max iterations reached — tool not executed.",
                isError: true,
              })),
            ),
          );
        }

        // Self-critique gate: ask the agent to critically evaluate and revise
        if (config.reflectionEnabled && iterations >= 2) {
          onProgress?.("Self-critiquing output...");

          // Ensure we don't create consecutive user messages.
          // If we just added dummy tool_result blocks (user role), we need an
          // assistant acknowledgment before the critique prompt.
          const lastMsg = messages[messages.length - 1];
          if (lastMsg && lastMsg.role === "user") {
            messages.push({ role: "assistant", content: "Let me critically review my output before finalizing." });
          }

          messages.push({
            role: "user",
            content: "Before I accept your output, critically evaluate it:\n1. What claims lack sufficient evidence?\n2. What obvious questions would a skeptical reader ask?\n3. Are there gaps a thorough analysis would catch?\n4. Is every recommendation specific and actionable?\nRevise your output to address any weaknesses, then produce your final JSON.",
          });

          try {
            const critiqueResponse = await callLLM(
              input.systemPrompt,
              messages,
              {
                maxTokens: 8192,
                thinking: provider === "anthropic" && config.useExtendedThinking && config.thinkingBudget
                  ? { budgetTokens: Math.min(config.thinkingBudget, 6_000) }
                  : undefined,
              },
            );

            totalInputTokens += critiqueResponse.usage.inputTokens;
            totalOutputTokens += critiqueResponse.usage.outputTokens;

            const critiqueText = extractTextFromResponse(critiqueResponse.content);
            if (critiqueText.length > 100) {
              text = critiqueText; // Use the revised output
            }
            messages.push({ role: "assistant", content: critiqueResponse.content });
          } catch {
            // Self-critique is non-critical — if it fails, use the original output
          }
        }

        // Parse the output
        lastOutput = parseAgentOutput(text, config.agent);
        break;
      }

      // Add assistant message with tool calls
      messages.push({ role: "assistant", content: response.content });

      // Execute tools in parallel (I/O bound — web searches, memory queries)
      const toolResults: { toolUseId: string; result: string; isError?: boolean }[] = [];
      const currentToolCalls: string[] = [];

      const toolPromises = toolUseBlocks.map(async (toolUse) => {
        const callSignature = `${toolUse.name}:${JSON.stringify(toolUse.input)}`;

        auditTrail.log({
          type: "tool_call",
          agent: config.agent,
          data: { toolName: toolUse.name, toolInput: toolUse.input },
        });

        onProgress?.(`Using ${toolUse.name}...`);

        const result = await executeToolWithTimeout(toolUse.name, toolUse.input, toolContext, toolOverrides);

        // Truncate very long tool results (per-agent limit)
        const maxChars = config.maxToolResultChars ?? DEFAULT_MAX_TOOL_RESULT_CHARS;
        const truncated = result.length > maxChars ? result.slice(0, maxChars) + "\n...[truncated]" : result;

        auditTrail.log({
          type: "tool_result",
          agent: config.agent,
          data: {
            toolName: toolUse.name,
            toolOutput: truncated.slice(0, 500), // Only store first 500 chars in audit
          },
        });

        return { toolUseId: toolUse.id, result: truncated, callSignature };
      });

      const settled = await Promise.allSettled(toolPromises);

      for (const s of settled) {
        if (s.status === "fulfilled") {
          toolResults.push({ toolUseId: s.value.toolUseId, result: s.value.result });
          currentToolCalls.push(s.value.callSignature);
        } else {
          // Should not happen since executeToolWithTimeout catches errors, but just in case
          toolResults.push({ toolUseId: "unknown", result: `Tool execution failed: ${s.reason}` });
        }
      }

      // Stall detection
      if (detectStall(previousToolCalls, currentToolCalls)) {
        onProgress?.("Detected repeated tool calls, finalizing...");
        // Force the agent to produce a final response
        messages.push(buildToolResultMessage(toolResults));
        messages.push({
          role: "user",
          content: "You are repeating the same tool calls. Please synthesize the information you already have and produce your final output now.",
        });
      } else {
        messages.push(buildToolResultMessage(toolResults));
      }

      previousToolCalls = currentToolCalls;
      iterations++;

      // Mid-loop reflection: at the midpoint, ask the LLM to reflect before continuing.
      // We do this by appending the reflection prompt to the LAST tool_result message
      // (which is a user message) to avoid consecutive user messages.
      const midpoint = Math.floor(config.maxIterations / 2);
      if (config.reflectionEnabled && iterations === midpoint && iterations > 2) {
        onProgress?.("Reflecting on findings so far...");
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === "user") {
          // Append reflection to the existing user message (tool results)
          const reflectionNote = "\n\n---\nMid-research reflection checkpoint. Before your next search:\n1. What key questions remain unanswered?\n2. What contradictions or gaps have you found in your sources?\n3. What are you most and least confident about?\nReflect briefly, then continue with targeted follow-up searches to fill the gaps.";
          if (typeof lastMsg.content === "string") {
            lastMsg.content += reflectionNote;
          } else {
            // For array content (tool_result blocks), add a text block
            messages.push({ role: "assistant", content: "I'll reflect on my findings so far before continuing." });
            messages.push({ role: "user", content: reflectionNote.trim() });
          }
        }
      }
    }

    // ── Validation ────────────────────────────────────────────────
    if (!lastOutput) {
      lastOutput = {
        success: false,
        agent: config.agent as AgentOutput["agent"],
        summary: "Agent failed to produce output.",
        error: "No output generated after tool-use loop.",
      };
      validationPassed = false;
      break;
    }

    if (!validate || attempt === maxAttempts - 1) {
      // No validation or last attempt — accept whatever we have
      break;
    }

    const validationResult = await validate(lastOutput, config);

    auditTrail.log({
      type: "validation",
      agent: config.agent,
      data: {
        validationResult: {
          pass: validationResult.passed,
          feedback: validationResult.feedback || "",
          scores: validationResult.qualityScores as Record<string, number> | undefined,
        },
      },
    });

    if (validationResult.passed) {
      validationPassed = true;
      break;
    }

    // Validation failed — retry with feedback
    validationPassed = false;
    retries++;

    auditTrail.log({
      type: "retry",
      agent: config.agent,
      data: {
        message: `Retry ${retries}/${config.maxRetries}: ${validationResult.feedback}`,
      },
    });

    onProgress?.(`Improving output (attempt ${retries + 1})...`);

    // Append validation feedback and ask for revision
    messages.push({
      role: "user",
      content: `Your output did not pass quality validation. Here is the feedback:\n\n${validationResult.feedback}\n\nPlease revise your output to address these issues. Produce your complete revised output now.`,
    });
  }

  return {
    result: lastOutput || {
      success: false,
      agent: config.agent as AgentOutput["agent"],
      summary: "Agent failed to produce output.",
      error: "Execution failed.",
    },
    auditTrail,
    tokenUsage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      thinkingTokens: totalThinkingTokens,
    },
    iterations,
    retries,
    validationPassed,
    durationMs: Date.now() - startTime,
  };
}
