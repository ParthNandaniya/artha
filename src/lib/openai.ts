import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (openaiClient) return openaiClient;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

/**
 * Reasoning-series models (o1, o3, o4, gpt-5*) only support temperature=1.
 * Returns true when the model does NOT accept a custom temperature value.
 */
export function isReasoningModel(model: string): boolean {
  return /^(o1|o3|o4|gpt-5)/.test(model);
}

export async function generateCompletion(
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number; model?: string }
) {
  const openai = getOpenAIClient();
  const model = options?.model || "gpt-4o";

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_completion_tokens: options?.maxTokens ?? 4096,
    ...(options?.temperature != null && !isReasoningModel(model)
      ? { temperature: options.temperature }
      : {}),
  });

  return response.choices[0]?.message?.content || "";
}

export async function generateJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  options?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<T> {
  const openai = getOpenAIClient();
  const model = options?.model || "gpt-4o";
  const reasoning = isReasoningModel(model);

  // Reasoning models spend tokens on chain-of-thought, so they need a higher
  // ceiling to leave room for the visible JSON output.
  const maxTokens = options?.maxTokens
    ? reasoning
      ? Math.max(options.maxTokens * 4, 4096)
      : options.maxTokens
    : 4096;

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: reasoning ? userPrompt + "\n\nRespond with valid JSON only." : userPrompt },
    ],
    max_completion_tokens: maxTokens,
    // Reasoning models (gpt-5*, o1, o3, o4) don't support json_object response_format
    ...(!reasoning ? { response_format: { type: "json_object" as const } } : {}),
    ...(options?.temperature != null && !reasoning
      ? { temperature: options.temperature }
      : {}),
  });

  // Use || instead of ?? so empty strings also fall back to "{}"
  const raw = response.choices[0]?.message?.content || "{}";
  // For reasoning models, extract the JSON object since they may include extra text
  if (reasoning) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(raw.slice(start, end + 1)) as T;
    }
  }
  return JSON.parse(raw) as T;
}

// ── Streaming variants ──────────────────────────────────────────────

export async function generateCompletionStreaming(
  systemPrompt: string,
  userPrompt: string,
  onToken: (text: string) => void,
  options?: { temperature?: number; maxTokens?: number; model?: string }
): Promise<string> {
  const openai = getOpenAIClient();
  const model = options?.model || "gpt-4o";

  const stream = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_completion_tokens: options?.maxTokens ?? 4096,
    stream: true,
    ...(options?.temperature != null && !isReasoningModel(model)
      ? { temperature: options.temperature }
      : {}),
  });

  let full = "";
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) {
      full += text;
      onToken(text);
    }
  }
  return full;
}

export async function generateJSONStreaming<T>(
  systemPrompt: string,
  userPrompt: string,
  onToken: (text: string) => void,
  options?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<T> {
  const openai = getOpenAIClient();
  const model = options?.model || "gpt-4o";
  const reasoning = isReasoningModel(model);

  const maxTokens = options?.maxTokens
    ? reasoning
      ? Math.max(options.maxTokens * 4, 4096)
      : options.maxTokens
    : 4096;

  const stream = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: reasoning ? userPrompt + "\n\nRespond with valid JSON only." : userPrompt },
    ],
    max_completion_tokens: maxTokens,
    // Reasoning models don't support json_object response_format
    ...(!reasoning ? { response_format: { type: "json_object" as const } } : {}),
    stream: true,
    ...(options?.temperature != null && !reasoning
      ? { temperature: options.temperature }
      : {}),
  });

  let full = "";
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) {
      full += text;
      onToken(text);
    }
  }

  const raw = full || "{}";
  if (reasoning) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(raw.slice(start, end + 1)) as T;
    }
  }
  return JSON.parse(raw) as T;
}
