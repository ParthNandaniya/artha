/**
 * Lightweight token estimation and context budget management.
 *
 * Uses a character-based heuristic (~3.5 chars/token for English text)
 * rather than a full tokenizer to avoid adding dependencies.
 * The 3.5 ratio is slightly conservative (real average is ~4),
 * providing a built-in safety margin.
 */

const CHARS_PER_TOKEN = 3.5;

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "gpt-5": 128_000,
  "gpt-5.4": 128_000,
  "gpt-4o-mini": 128_000,
  "claude-opus-4-6": 200_000,
  "claude-sonnet-4-6": 200_000,
};

const DEFAULT_CONTEXT_WINDOW = 128_000;

export interface ChatMessage {
  role: string;
  content: string;
}

/** Estimate token count from a string. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Convert a token count to approximate character count. */
function tokensToChars(tokens: number): number {
  return Math.floor(tokens * CHARS_PER_TOKEN);
}

/**
 * Calculate the token budget available for chat history.
 *
 * Subtracts completion reserve, system prompt overhead, company context,
 * and a 5% safety margin from the model's context window.
 */
export function getChatHistoryBudget(params?: {
  model?: string;
  maxCompletionTokens?: number;
  systemPromptChars?: number;
  companyContextChars?: number;
}): number {
  const {
    model = "gpt-5",
    maxCompletionTokens = 4096,
    systemPromptChars = 1500,
    companyContextChars = 5000,
  } = params ?? {};

  const contextWindow =
    MODEL_CONTEXT_WINDOWS[model] ?? DEFAULT_CONTEXT_WINDOW;
  const safetyMargin = Math.ceil(contextWindow * 0.05);

  const systemPromptTokens = estimateTokens("x".repeat(systemPromptChars));
  const companyContextTokens = estimateTokens("x".repeat(companyContextChars));

  const budget =
    contextWindow -
    maxCompletionTokens -
    systemPromptTokens -
    companyContextTokens -
    safetyMargin;

  // Floor at 2000 tokens so there's always some history
  return Math.max(budget, 2000);
}

/**
 * Fit chat messages into a token budget, preserving the most recent messages.
 *
 * Starts from the newest message and works backward. If not all messages fit,
 * prepends a "[Earlier conversation truncated]" marker so the model knows
 * context was dropped.
 */
export function fitChatHistory(
  messages: ChatMessage[],
  budgetTokens: number,
): string {
  if (messages.length === 0) return "";

  const budgetChars = tokensToChars(budgetTokens);
  const truncationMarker = "[Earlier conversation truncated]\n";
  const markerChars = truncationMarker.length;

  const fitted: string[] = [];
  let totalChars = 0;
  let allFit = true;

  for (let i = messages.length - 1; i >= 0; i--) {
    const line = `${messages[i].role}: ${messages[i].content}`;
    const lineChars = line.length + 1; // +1 for newline separator

    // Reserve space for truncation marker if we might not fit everything
    const effectiveBudget = i > 0 ? budgetChars - markerChars : budgetChars;

    if (totalChars + lineChars > effectiveBudget) {
      allFit = false;
      break;
    }

    fitted.unshift(line);
    totalChars += lineChars;
  }

  const prefix = allFit ? "" : truncationMarker;
  return prefix + fitted.join("\n");
}
