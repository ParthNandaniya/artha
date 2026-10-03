import { createHash } from "node:crypto";
import type { AgentInput, AgentOutput } from "./types";
import { runAgentic } from "./framework/agentic-runner";
import { validateOutput } from "./framework/validation";
import { getAgenticConfigForSource } from "@/config/agent-agentic-config";
import { getAgentModelConfig } from "@/config/agent-models";
import { summarizeContentForMemory } from "@/lib/personalization";

export async function runEmailReplierAgent(input: AgentInput): Promise<AgentOutput> {
  const progress = input.onProgress || (() => {});
  const source = (input.metadata?.executionSource as "pipeline" | "chat") || "chat";
  const config = getAgenticConfigForSource("email_replier", source);
  const modelConfig = getAgentModelConfig("email_replier");
  const threadHistory = (input.metadata?.threadHistory as string) || "";

  try {
    progress("Analyzing incoming email and retrieving context...");

    const systemPrompt = `You are a customer support representative for this company. You have access to memory tools — use them proactively to craft informed, contextual replies.

Your workflow:
1. FIRST, use query_memory to retrieve relevant company context, past interactions with this customer, product details, and FAQ answers
2. Use find_similar to check if similar questions have been answered before
3. Draft a reply that addresses every point in the customer's email with specific, accurate information

CRITICAL RULES:
- Address every specific point raised in the customer's email — don't leave anything unanswered
- Keep your reply concise and professional — no filler, every sentence should add value
- Use a warm but professional tone appropriate for customer support
- If the customer has a problem, acknowledge it and provide a clear solution or next step
- If you don't have enough context to fully answer, be honest and offer to follow up
- Sign off as the company (e.g. "The [Company Name] Team"), NOT as an individual person
- NEVER use placeholders like "[Your Name]" or "[Company Name]" — use the real company name from the context
- Reference specific product features, pricing, or policies when available from memory

${threadHistory ? `Previous email thread:\n${threadHistory}\n` : ""}

Your final output MUST be JSON with:
- replyHtml: the email reply in clean HTML with <p> tags for paragraphs
- sentiment: "positive", "neutral", "negative", or "urgent" — the detected customer sentiment
- topics: array of topic strings detected in the email (e.g. "billing", "feature-request", "bug-report")
- suggestedFollowUp: optional string describing a follow-up action if needed
- summary: one-line summary of what was addressed

Return ONLY valid JSON — no markdown fences, no explanation outside the JSON.`;

    const runnerOutput = await runAgentic(
      {
        systemPrompt,
        userPrompt: input.prompt,
        context: input.context,
        agentInput: input,
        config,
        model: modelConfig.model,
        provider: modelConfig.provider,
      },
      (output, cfg) => validateOutput(output, cfg, input.prompt),
    );

    const result = runnerOutput.result;

    if (result.success && result.documents?.length) {
      const doc = result.documents[0];
      const replyHtml = (doc.metadata?.replyHtml as string) || doc.content || result.summary;
      const sentiment = (doc.metadata?.sentiment as string) || "neutral";
      const topics = (doc.metadata?.topics as string[]) || [];
      const suggestedFollowUp = doc.metadata?.suggestedFollowUp as string | undefined;

      result.emails = [{
        to: (input.metadata?.replyTo as string) || "customer",
        subject: (input.metadata?.replySubject as string) || "Re: your inquiry",
        html: replyHtml,
      }];
      result.links = [{ label: "View reply", url: "#email" }];

      // Create follow-up task if suggested
      if (suggestedFollowUp) {
        result.tasksCreated = [{
          title: `Follow up: ${suggestedFollowUp}`,
          description: `Customer email follow-up. Sentiment: ${sentiment}. Topics: ${topics.join(", ")}`,
          type: "custom",
          tag: "marketing",
          agent: "email_replier",
        }];
      }

      // Store conversation context in memory for future replies
      result.supermemoryIngestions = [{
        content: buildEmailMemorySummary(
          (input.metadata?.replyTo as string) || "customer",
          input.prompt,
          replyHtml,
          sentiment,
          topics,
        ),
        customId: `email_reply_${input.projectId}_${stableHash(input.prompt)}`,
        dedupeKey: `email_reply:${input.projectId}:${stableHash(input.prompt)}`,
        metadata: { type: "email_reply", sentiment, topics },
      }];

      if (input.scratchpad) {
        input.scratchpad.write("email_replier.repliedTo", input.metadata?.replyTo || "customer");
        input.scratchpad.write("email_replier.sentiment", sentiment);
        input.scratchpad.write("email_replier.topics", topics);
      }
    }

    return result;
  } catch (error) {
    return {
      success: false,
      agent: "email_replier",
      summary: "Email reply generation failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function stableHash(prompt: string): string {
  return createHash("sha256").update(prompt.trim().toLowerCase()).digest("hex").slice(0, 12);
}

function buildEmailMemorySummary(
  customer: string,
  incomingEmail: string,
  replyHtml: string,
  sentiment: string,
  topics: string[],
): string {
  return [
    `Email conversation with ${customer}`,
    `Sentiment: ${sentiment}`,
    topics.length ? `Topics: ${topics.join(", ")}` : "",
    `Customer wrote: ${summarizeContentForMemory(incomingEmail, 300)}`,
    `We replied: ${summarizeContentForMemory(replyHtml.replace(/<[^>]+>/g, " "), 400)}`,
  ].filter(Boolean).join("\n");
}
