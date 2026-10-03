import Anthropic from "@anthropic-ai/sdk";
import { getAgentModelConfig, CLAUDE_SONNET, type ModelProvider } from "@/config/agent-models";
import { generateCompletion, generateJSON, generateCompletionStreaming, generateJSONStreaming } from "@/lib/openai";
import type { ModelTaskName } from "@/lib/types";

/**
 * Returns true for errors that should trigger a provider fallback
 * (overloaded, rate-limited, or service unavailable).
 */
export function isRetryableProviderError(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) {
    return [429, 529, 503, 500].includes(err.status);
  }
  // Also catch generic fetch / network errors (covers both OpenAI and Anthropic)
  if (err instanceof Error && /overloaded|rate.limit|service.unavailable|ECONNREFUSED|timeout|429|500|503|529/i.test(err.message)) {
    return true;
  }
  // OpenAI SDK errors with status codes
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status: number }).status;
    return [404, 429, 500, 503].includes(status);
  }
  return false;
}

// ── Anthropic client ─────────────────────────────────────────────────

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 120_000, // 2 minute timeout to prevent hanging requests
});

async function generateCompletionClaude(
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number; model?: string }
): Promise<string> {
  const response = await anthropic.messages.create({
    model: options?.model || CLAUDE_SONNET,
    max_tokens: options?.maxTokens ?? 4096,
    temperature: options?.temperature ?? 0.7,
    system: [
      {
        type: "text" as const,
        text: systemPrompt,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}

function repairTruncatedJSON(raw: string): string {
  let fixed = raw;
  let inString = false;
  let escapeNext = false;
  const stack: string[] = [];

  for (let i = 0; i < fixed.length; i++) {
    const char = fixed[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (char === "\\" && inString) { escapeNext = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === "{") stack.push("}");
    else if (char === "[") stack.push("]");
    else if (char === "}" || char === "]") stack.pop();
  }

  if (inString) fixed += '"';
  while (stack.length > 0) fixed += stack.pop();
  return fixed;
}

async function generateJSONClaude<T>(
  systemPrompt: string,
  userPrompt: string,
  options?: { maxTokens?: number; model?: string; temperature?: number },
  _retryCount = 0,
): Promise<T> {
  const maxTokens = options?.maxTokens ?? 4096;
  const response = await anthropic.messages.create({
    model: options?.model || CLAUDE_SONNET,
    max_tokens: maxTokens,
    temperature: options?.temperature,
    system: [
      {
        type: "text" as const,
        text: systemPrompt + "\n\nReturn ONLY valid JSON — no markdown fences, no backticks, no explanation. Start your response with { and end with }.",
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [
      { role: "user", content: userPrompt + "\n\nRespond with JSON only:" },
    ],
  });

  const block = response.content[0];
  const raw = block.type === "text" ? block.text : "{}";
  const cleaned = raw.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // If the response was truncated by max_tokens, retry with more tokens
    if (response.stop_reason === "max_tokens" && _retryCount < 1) {
      return generateJSONClaude<T>(
        systemPrompt,
        userPrompt,
        { ...options, maxTokens: Math.ceil(maxTokens * 1.5) },
        _retryCount + 1,
      );
    }

    // Try to repair truncated JSON as a last resort
    try {
      return JSON.parse(repairTruncatedJSON(cleaned)) as T;
    } catch {
      throw new Error(`Invalid JSON from LLM (stop_reason: ${response.stop_reason}, length: ${cleaned.length})`);
    }
  }
}

// ── Streaming variants ──────────────────────────────────────────────

async function generateCompletionClaudeStreaming(
  systemPrompt: string,
  userPrompt: string,
  onToken: (text: string) => void,
  options?: { temperature?: number; maxTokens?: number; model?: string }
): Promise<string> {
  const stream = anthropic.messages.stream({
    model: options?.model || CLAUDE_SONNET,
    max_tokens: options?.maxTokens ?? 4096,
    temperature: options?.temperature ?? 0.7,
    system: [
      {
        type: "text" as const,
        text: systemPrompt,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  let full = "";
  stream.on("text", (text) => {
    full += text;
    onToken(text);
  });

  await stream.finalMessage();
  return full;
}

async function generateJSONClaudeStreaming<T>(
  systemPrompt: string,
  userPrompt: string,
  onToken: (text: string) => void,
  options?: { maxTokens?: number; model?: string; temperature?: number },
): Promise<T> {
  const maxTokens = options?.maxTokens ?? 4096;
  const raw = await generateCompletionClaudeStreaming(
    systemPrompt + "\n\nReturn ONLY valid JSON — no markdown fences, no backticks, no explanation. Start your response with { and end with }.",
    userPrompt + "\n\nRespond with JSON only:",
    onToken,
    { ...options, maxTokens },
  );

  const cleaned = raw.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    try {
      return JSON.parse(repairTruncatedJSON(cleaned)) as T;
    } catch {
      throw new Error(`Invalid JSON from LLM (length: ${cleaned.length})`);
    }
  }
}

// ── Router ───────────────────────────────────────────────────────────

function getConfigOrThrow(task: ModelTaskName) {
  const config = getAgentModelConfig(task);
  if (!config.enabled) {
    throw new Error(`Task "${task}" is disabled in src/config/agent-models.ts`);
  }
  return config;
}

export async function generateAgentCompletion(
  task: ModelTaskName,
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number; model?: string }
): Promise<string> {
  const config = getConfigOrThrow(task);
  const model = options?.model || config.model;
  const opts = { model, temperature: options?.temperature, maxTokens: options?.maxTokens };

  const callProvider = (provider: ModelProvider, m: string) =>
    provider === "openai"
      ? generateCompletion(systemPrompt, userPrompt, { ...opts, model: m })
      : generateCompletionClaude(systemPrompt, userPrompt, { ...opts, model: m });

  try {
    return await callProvider(config.provider, model);
  } catch (err) {
    if (isRetryableProviderError(err) && config.fallback) {
      console.warn(`[agent-router] ${task}: ${config.provider}/${model} unavailable, falling back to ${config.fallback.provider}/${config.fallback.model}`);
      return callProvider(config.fallback.provider, config.fallback.model);
    }
    throw err;
  }
}

export async function generateAgentJSON<T>(
  task: ModelTaskName,
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number; model?: string }
): Promise<T> {
  const config = getConfigOrThrow(task);
  const model = options?.model || config.model;
  const opts = { temperature: options?.temperature, maxTokens: options?.maxTokens };

  const callProvider = (provider: ModelProvider, m: string) =>
    provider === "openai"
      ? generateJSON<T>(systemPrompt, userPrompt, { ...opts, model: m })
      : generateJSONClaude<T>(systemPrompt, userPrompt, { ...opts, model: m });

  try {
    return await callProvider(config.provider, model);
  } catch (err) {
    if (isRetryableProviderError(err) && config.fallback) {
      console.warn(`[agent-router] ${task}: ${config.provider}/${model} unavailable, falling back to ${config.fallback.provider}/${config.fallback.model}`);
      return callProvider(config.fallback.provider, config.fallback.model);
    }
    throw err;
  }
}

// ── Streaming router variants ───────────────────────────────────────

export async function generateAgentCompletionStreaming(
  task: ModelTaskName,
  systemPrompt: string,
  userPrompt: string,
  onToken: (text: string) => void,
  options?: { temperature?: number; maxTokens?: number; model?: string }
): Promise<string> {
  const config = getConfigOrThrow(task);
  const model = options?.model || config.model;
  const opts = { temperature: options?.temperature, maxTokens: options?.maxTokens };

  const callProvider = (provider: ModelProvider, m: string) =>
    provider === "openai"
      ? generateCompletionStreaming(systemPrompt, userPrompt, onToken, { ...opts, model: m })
      : generateCompletionClaudeStreaming(systemPrompt, userPrompt, onToken, { ...opts, model: m });

  try {
    return await callProvider(config.provider, model);
  } catch (err) {
    if (isRetryableProviderError(err) && config.fallback) {
      console.warn(`[agent-router] ${task}: ${config.provider}/${model} unavailable (streaming), falling back to ${config.fallback.provider}/${config.fallback.model}`);
      return callProvider(config.fallback.provider, config.fallback.model);
    }
    throw err;
  }
}

export async function generateAgentJSONStreaming<T>(
  task: ModelTaskName,
  systemPrompt: string,
  userPrompt: string,
  onToken: (text: string) => void,
  options?: { temperature?: number; maxTokens?: number; model?: string }
): Promise<T> {
  const config = getConfigOrThrow(task);
  const model = options?.model || config.model;
  const opts = { temperature: options?.temperature, maxTokens: options?.maxTokens };

  const callProvider = (provider: ModelProvider, m: string) =>
    provider === "openai"
      ? generateJSONStreaming<T>(systemPrompt, userPrompt, onToken, { ...opts, model: m })
      : generateJSONClaudeStreaming<T>(systemPrompt, userPrompt, onToken, { ...opts, model: m });

  try {
    return await callProvider(config.provider, model);
  } catch (err) {
    if (isRetryableProviderError(err) && config.fallback) {
      console.warn(`[agent-router] ${task}: ${config.provider}/${model} unavailable (streaming), falling back to ${config.fallback.provider}/${config.fallback.model}`);
      return callProvider(config.fallback.provider, config.fallback.model);
    }
    throw err;
  }
}
