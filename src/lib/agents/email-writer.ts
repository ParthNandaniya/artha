import type { AgentInput, AgentOutput } from "./types";
import { generateAgentCompletion, generateAgentJSON } from "@/lib/ai/agent-model-router";
import { runAgentic } from "./framework/agentic-runner";
import { validateOutput } from "./framework/validation";
import { getAgenticConfigForSource } from "@/config/agent-agentic-config";
import { getAgentModelConfig } from "@/config/agent-models";

type EmailSubtype = "cold_outreach" | "newsletter" | "reply" | "general";

function classifyEmailType(prompt: string): EmailSubtype {
  const lower = prompt.toLowerCase();
  if (lower.includes("outreach") || lower.includes("cold email") || lower.includes("reach out")) return "cold_outreach";
  if (lower.includes("newsletter") || lower.includes("announce") || lower.includes("notify") || lower.includes("update email")) return "newsletter";
  if (lower.includes("reply") || lower.includes("respond to")) return "reply";
  return "general";
}

export async function runEmailWriterAgent(input: AgentInput): Promise<AgentOutput> {
  try {
    const progress = input.onProgress || (() => {});
    const subtype = classifyEmailType(input.prompt);

    switch (subtype) {
      case "cold_outreach": {
        return runAgenticEmail(input, "cold_outreach", buildColdOutreachSystemPrompt(input));
      }

      case "newsletter": {
        return runAgenticEmail(input, "newsletter", buildNewsletterSystemPrompt(input));
      }

      case "reply": {
        progress("Researching context for reply...");

        // Research step: gather recipient/company context from memory
        const replyContext = await gatherRecipientContext(input);

        progress("Drafting email reply...");
        let reply = await generateAgentCompletion(
          "email_writer",
          `You are a professional email writer for an early-stage startup founder. Write a contextual, helpful reply that moves the conversation forward.

Instructions:
- Read the original email carefully and respond to every point raised — don't leave anything hanging
- Match the formality level of the original (if they wrote casually, reply casually; if formal, stay formal)
- Be concise but thorough — make every sentence count, cut filler phrases
- If the email is from a potential customer, partner, or investor: be warm, specific, and advance the relationship with a clear next step
- End with a single concrete question or next action — never end with "let me know if you have any questions"
- Format: plain text with line breaks between paragraphs (no heavy HTML styling for replies)
- SIGN-OFF: use the founder's real first name from the "Person:" field in the Company Context below. NEVER use placeholders like "[Your Name]" or "[Name]"

Company Context:
${input.context}

${replyContext ? `Recipient/Company Research:\n${replyContext}` : ""}`,
          input.prompt,
          { maxTokens: 1500 }
        );

        // Self-critique check
        const critiqued = await selfCritiqueEmail(reply, input);
        if (critiqued) reply = critiqued;

        return {
          success: true,
          agent: "email_writer",
          summary: "Email reply drafted",
          emails: [{
            to: (input.metadata?.replyTo as string) || "recipient",
            subject: (input.metadata?.replySubject as string) || "Re: your email",
            html: reply.replace(/\n/g, "<br>"),
          }],
          links: [{ label: "View reply", url: "#email" }],
        };
      }

      default: {
        progress("Researching context for email...");

        // Research step: gather recipient/company context from memory
        const generalContext = await gatherRecipientContext(input);

        progress("Crafting email copy...");
        const result = await generateAgentJSON<{
          to: string;
          subject: string;
          body: string;
          summary: string;
        }>(
          "email_writer",
          `You are a professional email writer for an early-stage startup. Draft an email that achieves the user's specific goal with precision and clarity.

Instructions:
- Identify the email's purpose from the request (outreach, follow-up, announcement, inquiry, etc.) and use the right structure for that type
- Write a compelling subject line that is specific and relevant to the recipient
- Keep the body focused — no filler, no fluff, every sentence serves a purpose
- Use the appropriate tone for the email type and relationship context
- End with a clear next step or action item
- Format the body as clean HTML with <p> tags for paragraphs
- SIGN-OFF: use the founder's real first name from the "Person:" field in the Company Context below. NEVER use placeholders like "[Your Name]" or "[Name]"

Return JSON with:
- to: recipient email address or description
- subject: email subject line
- body: HTML email body
- summary: one sentence describing what this email is trying to accomplish

Company Context:
${input.context}

${generalContext ? `Recipient/Company Research:\n${generalContext}` : ""}`,
          input.prompt
        );

        // Self-critique check on the generated body
        const critiqued = await selfCritiqueEmail(result.body, input);
        if (critiqued) result.body = critiqued;

        return {
          success: true,
          agent: "email_writer",
          summary: `Email drafted: "${result.subject}" → ${result.to}`,
          emails: [{ to: result.to, subject: result.subject, html: result.body, needsConfirmation: true }],
          links: [{ label: "Review email", url: "#email" }],
        };
      }
    }
  } catch (error) {
    return {
      success: false,
      agent: "email_writer",
      summary: "Email writing failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ── System Prompts for Agentic Subtypes ──────────────────────────────

function buildColdOutreachSystemPrompt(input: AgentInput): string {
  return `You are a world-class cold email specialist for early-stage startups. Write cold outreach emails that get real replies. You have access to memory tools — use query_memory to look up past context about leads, outreach history, and company positioning.

Best practices — follow every one:
- Subject line: 4-7 words, specific, personally relevant, never salesy (e.g. "quick question about [their thing]")
- Opening: skip pleasantries entirely — reference something specific about the recipient, their company, or a shared context in the very first sentence
- Body: 3-4 sentences max — name a specific pain point they likely feel, explain how this company solves it with one concrete detail, add a brief credibility signal if available
- CTA: one low-friction ask, ultra-specific ("open to a 15-min call Thursday or Friday?" not "let me know if you're interested")
- Tone: peer-to-peer — one founder/professional writing to another, not a sales rep pitching a product
- SIGN-OFF: use the founder's real first name from the "Person:" field in the Company Context below. NEVER use placeholders like "[Your Name]" or "[Name]"
- AVOID: "I hope this email finds you well", "I wanted to reach out", "We are a revolutionary/AI-powered/cutting-edge platform", excessive adjectives, long paragraphs

SUBJECT LINE A/B TESTING:
For each email, generate TWO subject line variants:
- subject_a: question-based (e.g., "Still doing X manually?")
- subject_b: statement-based (e.g., "We helped Y company cut X by 40%")
Also include "subject" as your recommended pick (copy one of the two).

Your final output MUST be JSON with:
- emails: array of { to, toName, company, role, subject, subject_a, subject_b, body (HTML with <p> tags) }
- strategy: 1-2 sentences describing the targeting rationale and angle being used
- summary: one-line summary of what was drafted

Return ONLY valid JSON — no markdown fences, no explanation outside the JSON.`;
}

function buildNewsletterSystemPrompt(input: AgentInput): string {
  return `You are a product storyteller and email marketer for an early-stage startup. Write a newsletter that reads like it's from a real founder — personal, specific, and worth opening. You have access to memory tools — use query_memory to look up recent company updates, milestones, and context.

Best practices — follow every one:
- Subject line: specific and intriguing, not clickbait or generic ("What we shipped in Feb" beats "Monthly Update")
- Opening: 1-2 sentence personal hook — make the reader feel like they're getting a behind-the-scenes look
- Body structure: use 2-3 clear sections (e.g. What's New / Why It Matters / What's Coming Next) with short HTML headers
- Keep each section to 2-4 sentences — no walls of text
- Include one prominent CTA button (e.g. "Try it now", "Read the full post", "Book a call")
- Tone: warm, direct, founder energy — not a corporate press release
- Length: 250-400 words total in the body
- Format: clean HTML with <h3> headers, <p> paragraphs, and one <a> CTA button
- SIGN-OFF: use the founder's real first name from the "Person:" field in the Company Context below. NEVER use placeholders like "[Your Name]" or "[Name]"

Your final output MUST be JSON with:
- subject: email subject line
- body: full HTML email body
- summary: 1-2 sentences describing what this newsletter covers

Return ONLY valid JSON — no markdown fences, no explanation outside the JSON.`;
}

// ── Agentic Email Runner ─────────────────────────────────────────────

async function runAgenticEmail(
  input: AgentInput,
  emailSubtype: "cold_outreach" | "newsletter",
  systemPrompt: string,
): Promise<AgentOutput> {
  const progress = input.onProgress || (() => {});
  const source = (input.metadata?.executionSource as "pipeline" | "chat") || "chat";
  const config = getAgenticConfigForSource("email_writer", source);
  const modelConfig = getAgentModelConfig("email_writer");

  progress(emailSubtype === "cold_outreach" ? "Crafting cold outreach emails..." : "Writing newsletter content...");

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

  // Post-process: enrich result based on subtype
  if (result.success) {
    if (emailSubtype === "cold_outreach" && result.emails && result.emails.length > 0) {
      // Ensure emails are marked as needing confirmation
      result.emails = result.emails.map((e) => ({ ...e, needsConfirmation: true }));

      // Add outreach task
      if (!result.tasksCreated || result.tasksCreated.length === 0) {
        result.tasksCreated = [{
          title: `Send ${result.emails.length} outreach emails`,
          description: result.summary,
          type: "outreach",
          tag: "cold-outreach",
          agent: "email_writer",
        }];
      }

      result.links = [{ label: "Review emails", url: "#email" }];

      // Write to scratchpad for downstream agents
      if (input.scratchpad) {
        input.scratchpad.write("email.outreach.count", result.emails.length);
        input.scratchpad.write(
          "email.outreach.recipients",
          result.emails.map((e) => e.to).join(", "),
        );
        input.scratchpad.write(
          "email.outreach.subjects",
          result.emails.map((e) => e.subject).join(" | "),
        );
      }
    } else if (emailSubtype === "newsletter" && result.emails && result.emails.length > 0) {
      // Ensure newsletter email is marked correctly
      result.emails = result.emails.map((e) => ({
        ...e,
        to: e.to || "subscribers",
        needsConfirmation: true,
      }));

      result.links = [{ label: "Review newsletter", url: "#email" }];

      // Write to scratchpad
      if (input.scratchpad && result.emails[0]) {
        input.scratchpad.write("email.newsletter.subject", result.emails[0].subject);
      }
    }
  }

  return result;
}

// ── Research & Self-Critique Helpers ─────────────────────────────────

async function gatherRecipientContext(input: AgentInput): Promise<string | null> {
  try {
    // Extract recipient info from the prompt to query memory
    const recipientHints = input.metadata?.replyTo || input.metadata?.recipientEmail || "";
    const query = recipientHints
      ? `${recipientHints} company background relationship`
      : input.prompt.slice(0, 200);

    const context = await generateAgentCompletion(
      "email_writer",
      `You are a research assistant. Given the user's email request and company context, extract any relevant information about the recipient, their company, previous interactions, and relationship context that would help personalize the email.

Return a concise summary of relevant context (2-4 sentences). If no specific recipient information is available, return "No specific recipient context found."

Company Context:
${input.context}`,
      `Extract recipient context from this email request: ${query}\n\nFull request: ${input.prompt}`,
      { maxTokens: 500 },
    );

    if (context.includes("No specific recipient context found")) return null;
    return context;
  } catch {
    return null;
  }
}

async function selfCritiqueEmail(
  emailContent: string,
  input: AgentInput,
): Promise<string | null> {
  try {
    const critique = await generateAgentJSON<{
      score: number;
      feedback: string;
    }>(
      "quality_judge",
      `You are an email quality judge. Evaluate this email draft.

Check:
1. Is the email personalized with specific details about the recipient (not generic)?
2. Is there a clear, concrete CTA or next step?
3. Is it concise and free of filler?

Return JSON with:
- score: 1-5 (5=excellent, 1=poor)
- feedback: one sentence explaining what needs improvement (or "Good" if score >= 3)`,
      `Evaluate this email:\n${emailContent.replace(/<[^>]+>/g, "").slice(0, 1000)}`,
      { maxTokens: 300 },
    );

    if (critique.score >= 3) return null;

    // Score below 3 — regenerate once with feedback
    const improved = await generateAgentCompletion(
      "email_writer",
      `You are a professional email writer. Rewrite this email incorporating the following feedback. Keep the same intent and recipient, but improve the quality.

Feedback: ${critique.feedback}

Company Context:
${input.context}

Return ONLY the improved email body (HTML with <p> tags or plain text with line breaks). No explanation.`,
      `Improve this email:\n${emailContent}`,
      { maxTokens: 1500 },
    );

    return improved;
  } catch {
    // Self-critique is non-blocking
    return null;
  }
}
