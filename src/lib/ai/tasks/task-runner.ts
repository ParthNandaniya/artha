import { generateCompletion, generateJSON } from "@/lib/openai";
import { ProjectMemory } from "@/lib/memory";
import type { Task } from "@/lib/types";

export interface OutreachResult {
  emails: { to: string; toName?: string; company?: string; role?: string; subject: string; body: string }[];
  strategy: string;
  needsConfirmation: boolean;
}

export interface TaskExecutionResult {
  result: Record<string, unknown>;
  summary: string;
  needsConfirmation?: boolean;
}

/**
 * Execute a task using either a pre-built Supermemory context string
 * or a legacy ProjectMemory object for backward compatibility.
 */
export async function executeTask(
  task: Task,
  memoryOrContext: ProjectMemory | string,
  options?: { autoSend?: boolean }
): Promise<TaskExecutionResult> {
  const contextBlock = typeof memoryOrContext === "string"
    ? memoryOrContext
    : `Company: ${memoryOrContext.companyDescription || ""}
Mission: ${memoryOrContext.mission || ""}
Target Audience: ${memoryOrContext.targetAudience || ""}
Key Insights: ${memoryOrContext.keyInsights?.join(", ") || "None yet"}`.trim();

  switch (task.type) {
    case "outreach": {
      const result = await generateJSON<{
        emails: { to: string; toName?: string; company?: string; role?: string; subject: string; body: string }[];
        strategy: string;
      }>(
        `You are a world-class cold email specialist for early-stage startups. Write outreach emails that get real replies.

Best practices — follow every one:
- Subject line: 4-7 words, specific and personally relevant to the recipient, never salesy
- Opening: no pleasantries — reference something specific about the recipient or their context in the first sentence
- Body: 3-4 sentences max — name a specific pain point, show how this company solves it with one concrete detail, add a brief credibility signal
- CTA: one specific, low-friction ask ("15-min call Thursday?" not "feel free to reach out")
- Tone: peer-to-peer, one professional writing to another — not a sales pitch
- AVOID: "I hope this email finds you well", "we're a revolutionary platform", filler phrases, long paragraphs
- IMPORTANT: Only generate emails for leads that have a real email address. Skip leads without emails entirely — do not use placeholders or descriptions instead of real addresses.

Return JSON with:
- emails: array of { to: real email address, toName, company, role, subject, body (HTML with <p> tags) }
- strategy: 1-2 sentences on targeting rationale and the specific angle being used

Company Context:
${contextBlock}`,
        `Task: ${task.prompt || task.description || "Generate outreach emails"}`
      );

      const needsConfirmation = !options?.autoSend;

      return {
        result: { ...result, needsConfirmation } as unknown as Record<string, unknown>,
        summary: `Generated ${result.emails.length} outreach emails targeting ${task.description || "potential customers/partners"}.`,
        needsConfirmation,
      };
    }

    case "newsletter": {
      const result = await generateJSON<{
        subject: string;
        body: string;
        summary: string;
      }>(
        `You are a product storyteller writing for a startup's email list. Write a newsletter that founders, customers, and early users actually want to read.

Best practices — follow every one:
- Subject line: specific and intriguing, not generic (e.g. "What we shipped this week + one big lesson" beats "Monthly Update")
- Opening: 1-2 sentence personal hook — make readers feel like they're getting behind-the-scenes access
- Body: 2-3 clear sections using short HTML headers — e.g. What's New / Why It Matters / What's Coming Next
- Keep sections tight: 2-4 sentences each — no walls of text
- Include one prominent CTA link or button
- Tone: warm, direct, authentic founder voice — not corporate or polished
- Length: 250-400 words in the body

Return JSON with:
- subject: email subject line
- body: full HTML email body with <h3> headers, <p> paragraphs, and one <a> CTA
- summary: 1-2 sentences describing what this newsletter covers

Company Context:
${contextBlock}`,
        `Task: ${task.prompt || task.description || "Write a product update newsletter"}`
      );

      const needsConfirmation = !options?.autoSend;

      return {
        result: { ...result, needsConfirmation } as unknown as Record<string, unknown>,
        summary: result.summary || `Newsletter draft: ${result.subject}`,
        needsConfirmation,
      };
    }

    case "custom":
    default: {
      const response = await generateCompletion(
        `You are Artha, an AI chief of staff helping a startup execute its growth strategy. Execute the following task with expertise and produce specific, actionable output.

Instructions:
- Understand the exact goal of this task and what a successful completion looks like
- Use the company context to make all output specific and relevant to this company — not generic templates
- Produce concrete deliverables: actual content, analysis, plans, or decisions — not advice about what to do
- Be thorough but concise — every paragraph should earn its place
- If the task is ambiguous, state your assumption clearly and proceed with the most useful interpretation

Company Context:
${contextBlock}`,
        task.prompt || task.description || "Execute task",
        { maxTokens: 4000 }
      );

      return {
        result: { response, completedAt: new Date().toISOString() },
        summary: response.slice(0, 200) + (response.length > 200 ? "..." : ""),
      };
    }
  }
}

export async function generateTaskSuggestions(
  memoryOrContext: ProjectMemory | string,
  recentChanges?: string
): Promise<{ title: string; description: string; type: string; tag?: string; agent?: string }[]> {
  const contextBlock = typeof memoryOrContext === "string"
    ? memoryOrContext
    : `Company: ${memoryOrContext.companyDescription || ""}
Mission: ${memoryOrContext.mission || ""}
Target Audience: ${memoryOrContext.targetAudience || ""}
Competitors: ${memoryOrContext.competitors?.join(", ") || "Unknown"}`;

  const changeContext = recentChanges
    ? `\n\nRecent changes that may warrant a newsletter/announcement:\n${recentChanges}`
    : "";

  const suggestions = await generateJSON<{
    tasks: { title: string; description: string; type: string; tag?: string; agent?: string }[];
  }>(
    `You are a startup advisor. Based on the company context, suggest 5-8 tasks that should be executed to grow this company.
Return JSON with: tasks (array of {title, description, type, tag, agent}).
Type must be one of: outreach, newsletter, custom.
Tag must be one of: research, marketing, cold-outreach, engineering, social, content, newsletter.
Agent must be one of: research, website_builder, email_writer, task_generator, twitter.
Tasks should be specific, actionable, and relevant to the company stage.
If there were recent significant changes (website update, new features, etc.), include a newsletter task to notify contacts.${changeContext}`,
    contextBlock
  );

  return suggestions.tasks || [];
}
