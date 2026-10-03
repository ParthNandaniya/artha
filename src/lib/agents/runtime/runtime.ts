import {
  buildToolResultMessage,
  callAnthropicWithTools,
  extractTextFromResponse,
  extractToolUseFromResponse,
  type AnthropicToolsMessage,
  type AnthropicToolsOptions,
  type AnthropicToolsResponse,
} from "@/lib/ai/anthropic-tools";
import { callOpenAIWithTools } from "@/lib/ai/openai-tools";
import { isRetryableProviderError } from "@/lib/ai/agent-model-router";
import { CLAUDE_SONNET, GPT_5_4 } from "@/config/agent-models";
import { buildSystemPrompt } from "./system-prompt";
import { MAIN_TOOLS, toolMap } from "./tool-set";
import { Workspace } from "./workspace";
import { CreditLedger } from "./credit-ledger";
import type {
  RunArthaAgentInput,
  RunArthaAgentResult,
  RuntimeSession,
  RuntimeToolContext,
} from "./types";

const MAX_ITERATIONS = 12;
const MAX_TOOL_RESULT_CHARS = 20_000;
const MAX_MESSAGES_IN_CONTEXT = 60;
const CONTEXT_TRIM_LAST_N = 12;

// OpenAI primary (user has OpenAI credits). GPT-5.4 matches autonomous_orchestrator
// and website_builder. Override with ARTHA_AGENT_MODEL env var.
const DEFAULT_CHAT_AGENT_MODEL = process.env.ARTHA_AGENT_MODEL || GPT_5_4;

// Anthropic fallback. Kicks in when OpenAI returns a retryable error
// (rate-limit, 5xx, service-unavailable). Once triggered inside a single turn,
// the rest of that turn sticks with Anthropic to avoid repeat OpenAI timeouts.
// Disable entirely with ARTHA_AGENT_DISABLE_FALLBACK=1.
const FALLBACK_MODEL = process.env.ARTHA_AGENT_FALLBACK_MODEL || CLAUDE_SONNET;
const FALLBACK_ENABLED = process.env.ARTHA_AGENT_DISABLE_FALLBACK !== "1";

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function trimMessages(messages: AnthropicToolsMessage[]): AnthropicToolsMessage[] {
  if (messages.length <= MAX_MESSAGES_IN_CONTEXT) return messages;
  const first = messages[0];
  const tail = messages.slice(-CONTEXT_TRIM_LAST_N);
  const middle = messages.slice(1, -CONTEXT_TRIM_LAST_N);
  const summarizedMiddle: AnthropicToolsMessage[] = middle.map((m) => {
    if (typeof m.content === "string" && m.content.length > 800) {
      return { role: m.role, content: m.content.slice(0, 300) + "\n…[earlier content summarized]" };
    }
    if (Array.isArray(m.content)) {
      const summarized = m.content.map((block) => {
        if ("type" in block && block.type === "tool_use") return block;
        if ("type" in block && block.type === "text") {
          const bb = block as { type: "text"; text: string };
          return { type: "text" as const, text: bb.text.length > 400 ? bb.text.slice(0, 200) + "…" : bb.text };
        }
        if ("content" in block) {
          const bb = block as { type: string; content: unknown };
          const content = typeof bb.content === "string" ? bb.content : JSON.stringify(bb.content);
          if (content.length > 400) {
            return { ...bb, content: content.slice(0, 200) + "…[truncated]" };
          }
        }
        return block;
      });
      return { role: m.role, content: summarized as AnthropicToolsMessage["content"] };
    }
    return m;
  });
  return [first, ...summarizedMiddle, ...tail];
}

export async function runArthaAgent(input: RunArthaAgentInput): Promise<RunArthaAgentResult> {
  const session: RuntimeSession = {
    sessionId: randomId(),
    runId: randomId(),
    projectId: input.projectId,
    userId: input.userId,
    projectSlug: input.metadata.slug,
    projectName: input.metadata.companyName,
    companyContext: input.context,
    activePanel: input.metadata.activePanel,
    emit: input.emit,
    signal: input.signal,
    todos: [],
    preAuthorized: new Set<string>(),
    depth: 0,
  };

  const workspace = new Workspace({ projectId: input.projectId, userId: input.userId });
  const credits = new CreditLedger({
    available: input.creditsAvailable,
    freeWebsiteBuildAvailable: input.freeWebsiteBuildAvailable,
    emit: input.emit,
    maxPerTurn: 10,
  });

  const toolCtx: RuntimeToolContext = { session, workspace, credits };
  const tools = MAIN_TOOLS;
  const toolsByName = toolMap(tools);

  const systemPrompt = buildSystemPrompt({
    companyName: input.metadata.companyName,
    slug: input.metadata.slug,
    projectId: input.projectId,
    companyContext: input.context,
    chatHistory: input.chatHistory,
    activePanel: input.metadata.activePanel,
    creditsRemaining: input.creditsAvailable,
    freeWebsiteBuildAvailable: input.freeWebsiteBuildAvailable,
  });

  const messages: AnthropicToolsMessage[] = [{ role: "user", content: input.message }];
  const toolDefs = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));

  input.emit({ event: "agent_start", data: { agent: "chat_agent", step: "Thinking...", agentIndex: 1, totalAgents: 1 } });

  let iterations = 0;
  let toolCallCount = 0;
  let finalText = "";
  let stopReason: RunArthaAgentResult["stopReason"] = "completed";
  let errorMsg: string | undefined;
  let fallbackActive = false;

  // Provider-routing wrapper. OpenAI first; on retryable errors, fall back to
  // Anthropic and stay there for the rest of this turn.
  const callLLM = async (
    systemPrompt: string,
    msgs: AnthropicToolsMessage[],
    options: AnthropicToolsOptions,
  ): Promise<AnthropicToolsResponse> => {
    if (fallbackActive && FALLBACK_ENABLED) {
      return callAnthropicWithTools(systemPrompt, msgs, { ...options, model: FALLBACK_MODEL });
    }
    try {
      return await callOpenAIWithTools(systemPrompt, msgs, { ...options, model: DEFAULT_CHAT_AGENT_MODEL });
    } catch (err) {
      if (!FALLBACK_ENABLED || !isRetryableProviderError(err)) throw err;
      console.warn(
        "[chat-agent] OpenAI failed with retryable error — falling back to Anthropic for the rest of this turn:",
        err instanceof Error ? err.message : String(err),
      );
      fallbackActive = true;
      return callAnthropicWithTools(systemPrompt, msgs, { ...options, model: FALLBACK_MODEL });
    }
  };

  // Fast-path: if there's no budget at all, don't even try.
  if (credits.startedBroke()) {
    return {
      finalText:
        "This request needs credits to run, but your balance is 0.\n\n[Get Credits]",
      todos: [],
      committed: [],
      creditsUsed: 0,
      creditsRemaining: 0,
      toolCalls: 0,
      iterations: 0,
      stopReason: "credits_exhausted",
    };
  }

  try {
    while (iterations < MAX_ITERATIONS) {
      if (input.signal?.aborted) {
        stopReason = "aborted";
        break;
      }
      if (credits.exhausted()) {
        stopReason = "credits_exhausted";
        break;
      }

      const trimmed = trimMessages(messages);

      const response = await callLLM(systemPrompt, trimmed, {
        maxTokens: 8192,
        tools: toolDefs,
        // Reasoning models (gpt-5*, o1/o3/o4) ignore temperature; safe to set.
        temperature: 0.2,
      });

      credits.chargeTokens(response.usage.inputTokens, response.usage.outputTokens);

      const toolUseBlocks = extractToolUseFromResponse(response.content);
      const assistantText = extractTextFromResponse(response.content);

      if (toolUseBlocks.length === 0) {
        finalText = assistantText || finalText;
        break;
      }

      if (assistantText.trim().length > 0) {
        input.emit({ event: "thinking", data: { step: assistantText.slice(0, 200) } });
      }

      messages.push({ role: "assistant", content: response.content });

      const toolPromises = toolUseBlocks.map(async (block) => {
        const callId = block.id;
        input.emit({
          event: "tool_use",
          data: {
            name: block.name,
            callId,
            input: sanitizeInputForEmit(block.input),
          },
        });

        const tool = toolsByName.get(block.name);
        if (!tool) {
          return { toolUseId: callId, result: `Unknown tool: ${block.name}`, isError: true };
        }

        const start = Date.now();
        try {
          const result = await tool.execute(block.input, toolCtx);
          const duration = Date.now() - start;
          toolCallCount++;

          const truncated = result.content.length > MAX_TOOL_RESULT_CHARS
            ? result.content.slice(0, MAX_TOOL_RESULT_CHARS) + "\n…[truncated]"
            : result.content;

          input.emit({
            event: "subtask_thinking",
            data: {
              subtaskId: `tool_${callId}`,
              message: `${block.name} (${duration}ms)${result.isError ? " — error" : ""}`,
            },
          });

          return { toolUseId: callId, result: truncated, isError: result.isError };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { toolUseId: callId, result: msg, isError: true };
        }
      });

      const results = await Promise.all(toolPromises);
      messages.push(buildToolResultMessage(results));
      iterations++;
    }

    if (iterations >= MAX_ITERATIONS && !finalText) {
      stopReason = "max_iterations";
      finalText = "I've made progress on your request but hit the iteration limit. Here's where things stand — check the task breakdown above. Ask me to continue if you want me to pick up from here.";
    }
  } catch (err) {
    stopReason = "error";
    errorMsg = err instanceof Error ? err.message : String(err);
    finalText = `I ran into an error while working: ${errorMsg}`;
  }

  // If user aborted mid-loop, leave the workspace uncommitted so we don't
  // overwrite their data with half-finished edits. The route's abort handler
  // already updated chat_messages to "Cancelled.".
  if (stopReason === "aborted") {
    return {
      finalText: finalText || "Cancelled.",
      todos: session.todos,
      committed: [],
      creditsUsed: credits.used(),
      creditsRemaining: credits.remaining(),
      toolCalls: toolCallCount,
      iterations,
      stopReason,
      error: errorMsg,
      fallbackUsed: fallbackActive,
    };
  }

  // If the agent errored out, skip commit so a broken intermediate state
  // doesn't persist. Rollback in-memory so diffSummary() is empty.
  if (stopReason === "error") {
    workspace.rollback();
    return {
      finalText: finalText || "An error occurred.",
      todos: session.todos,
      committed: [],
      creditsUsed: credits.used(),
      creditsRemaining: credits.remaining(),
      toolCalls: toolCallCount,
      iterations,
      stopReason,
      error: errorMsg,
      fallbackUsed: fallbackActive,
    };
  }

  // Normal path: capture diff BEFORE commit (commit clears dirty flags).
  const pendingDiff = workspace.diffSummary();
  const { committed, errors } = await workspace.commit().catch((err) => ({
    committed: [] as string[],
    errors: [{ path: "(commit)", error: err instanceof Error ? err.message : String(err) }],
  }));

  if (errors.length > 0) {
    const note = `\n\n_Note: ${errors.length} change(s) couldn't be saved: ${errors.map((e) => `${e.path}: ${e.error}`).join("; ")}._`;
    finalText = (finalText || "Done.") + note;
  }

  const committedSet = new Set(committed);
  const committedChanges = pendingDiff
    .filter((d) => committedSet.has(d.path))
    .map((d) => ({ path: d.path, changeType: d.changeType }));

  for (const change of committedChanges) {
    input.emit({
      event: "tool_use",
      data: { kind: "workspace_commit", path: change.path, changeType: change.changeType },
    });
  }

  // If credits ran out mid-loop but we finished something, keep finalText
  // informative; if we never produced output, surface a clear CTA.
  if (stopReason === "credits_exhausted" && !finalText.trim()) {
    finalText =
      "I ran out of credits before finishing this request.\n\n[Get Credits]";
  }

  return {
    finalText: finalText || "Done.",
    todos: session.todos,
    committed: committedChanges,
    creditsUsed: credits.used(),
    creditsRemaining: credits.remaining(),
    toolCalls: toolCallCount,
    iterations,
    stopReason,
    error: errorMsg,
    fallbackUsed: fallbackActive,
  };
}

function sanitizeInputForEmit(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string" && v.length > 200) {
      out[k] = v.slice(0, 200) + "…";
    } else if (Array.isArray(v) && v.length > 10) {
      out[k] = [...v.slice(0, 10), `…(+${v.length - 10} more)`];
    } else {
      out[k] = v;
    }
  }
  return out;
}
