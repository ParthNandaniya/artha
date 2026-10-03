import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import type { AgentOutput } from "../types";
import type { AgentName } from "@/lib/types";

// ── Types ───────────────────────────────────────────────────────────

interface QualityJudgeInput {
  agentName: AgentName;
  output: AgentOutput;
  originalPrompt: string;
  threshold: number;
  weights?: {
    completeness: number;
    accuracy: number;
    actionability: number;
    formatting: number;
  };
  model?: string;
}

export interface QualityJudgeResult {
  passed: boolean;
  scores: {
    completeness: number;
    accuracy: number;
    actionability: number;
    formatting: number;
    average: number;
  };
  feedback: string;
}

// ── Agent-specific rubrics ──────────────────────────────────────────

const RUBRICS: Record<string, string> = {
  research: `Evaluate this research output:
- Completeness: Does it cover all key aspects of the topic? Are there obvious gaps? Does it include data, metrics, and specific examples?
- Accuracy: Are claims supported by evidence? Are numbers plausible? Are sources cited?
- Actionability: Can the reader make decisions based on this? Are there clear takeaways and next steps?
- Formatting: Is it well-structured with headings, tables for data, and clear organization?`,

  website_builder: `Evaluate this website/landing page output:
- Completeness: Does it have all expected sections (hero, features, CTA, footer)? Is content substantial, not placeholder?
- Accuracy: Is the content factually consistent with the company context? Are there no lorem ipsum or placeholder texts?
- Actionability: Does the page have clear CTAs? Would a visitor understand the value proposition?
- Formatting: Is the HTML well-structured? Are sections logically ordered? Is it visually coherent?`,

  lead_finder: `Evaluate this lead finding output:
- Completeness: Are there enough leads (8+)? Does each lead have name, company, role, and relevance score?
- Accuracy: Do the leads seem like real people/companies? Are roles and companies plausible?
- Actionability: Is there enough info to reach out? Are emails or LinkedIn URLs included where possible?
- Formatting: Are leads well-structured with clear fields? Is the scoring consistent?`,

  email_writer: `Evaluate this email output:
- Completeness: Does it have subject line, body, and sign-off? Is the body substantive (not just 1 sentence)?
- Accuracy: Is it personalized to the recipient? Does it reference specific, relevant details?
- Actionability: Is there a clear CTA? Is it easy to respond to?
- Formatting: Is the tone professional? Is the length appropriate (not too long, not too short)?`,

  default: `Evaluate this AI agent output:
- Completeness: Does it fully address the task? Are there obvious gaps?
- Accuracy: Is the content factually sound and consistent?
- Actionability: Can someone act on this output?
- Formatting: Is it well-organized and easy to read?`,
};

// ── Quality Judge ───────────────────────────────────────────────────

export async function runQualityJudge(input: QualityJudgeInput): Promise<QualityJudgeResult> {
  const rubric = RUBRICS[input.agentName] || RUBRICS.default;

  // Build a concise summary of the output for judging
  const outputSummary = buildOutputSummary(input.output);

  const systemPrompt = `You are a strict quality judge for AI agent outputs. You evaluate outputs against specific criteria and provide scores and actionable feedback.

${rubric}

Score each dimension from 1 to 5:
1 = Very poor, major issues
2 = Below average, significant gaps
3 = Acceptable, meets basic requirements
4 = Good, solid quality
5 = Excellent, exceeds expectations

Be strict but fair. A score of 3 should be the baseline for acceptable quality.
If the output has issues, provide SPECIFIC, ACTIONABLE feedback about what to fix.`;

  const userPrompt = `Original task: ${input.originalPrompt.slice(0, 500)}

Agent output to evaluate:
${outputSummary}

Return your evaluation as JSON:
{
  "completeness": <1-5>,
  "accuracy": <1-5>,
  "actionability": <1-5>,
  "formatting": <1-5>,
  "feedback": "<specific actionable feedback if any score is below 4, otherwise 'Output meets quality standards.'>"
}`;

  try {
    const result = await generateAgentJSON<{
      completeness: number;
      accuracy: number;
      actionability: number;
      formatting: number;
      feedback: string;
    }>(
      // Dedicated routing — routes to Claude Sonnet via agent-models.ts
      "quality_judge",
      systemPrompt,
      userPrompt,
      { maxTokens: 500 },
    );

    const weights = input.weights || {
      completeness: 0.3,
      accuracy: 0.3,
      actionability: 0.25,
      formatting: 0.15,
    };

    const average =
      result.completeness * weights.completeness +
      result.accuracy * weights.accuracy +
      result.actionability * weights.actionability +
      result.formatting * weights.formatting;

    const scores = {
      completeness: result.completeness,
      accuracy: result.accuracy,
      actionability: result.actionability,
      formatting: result.formatting,
      average: Math.round(average * 100) / 100,
    };

    return {
      passed: average >= input.threshold,
      scores,
      feedback: average >= input.threshold
        ? "Output meets quality standards."
        : result.feedback || "Output quality is below threshold. Please improve overall quality.",
    };
  } catch (err) {
    // If the quality judge fails, don't block the agent — pass by default
    console.error("Quality judge error:", err);
    return {
      passed: true,
      scores: { completeness: 3, accuracy: 3, actionability: 3, formatting: 3, average: 3 },
      feedback: "Quality judge encountered an error, passing by default.",
    };
  }
}

// ── Lightweight Quality Judge (free tools) ──────────────────────────

/**
 * Lightweight quality judge for free tools.
 * Evaluates only completeness and actionability (2 dimensions).
 * Uses Sonnet via "free_tool" task routing for cost efficiency.
 * Non-blocking: returns a passing result on failure.
 */
export async function runLightweightJudge(input: {
  output: AgentOutput;
  originalPrompt: string;
  threshold: number;
}): Promise<QualityJudgeResult> {
  const outputSummary = buildOutputSummary(input.output);

  const systemPrompt = `You are a fast quality judge. Evaluate this AI output on two dimensions only.

Score each from 1 to 5:
- Completeness: Does it address the task fully? Any obvious gaps?
- Actionability: Can someone act on this output? Are there clear takeaways?

Be strict but fair. 3 = acceptable baseline.`;

  const userPrompt = `Task: ${input.originalPrompt.slice(0, 300)}

Output:
${outputSummary.slice(0, 1500)}

Return JSON: { "completeness": <1-5>, "actionability": <1-5>, "feedback": "<brief feedback if any score < 4>" }`;

  try {
    const result = await generateAgentJSON<{
      completeness: number;
      actionability: number;
      feedback: string;
    }>(
      "free_tool",
      systemPrompt,
      userPrompt,
      { maxTokens: 200 },
    );

    const average = (result.completeness * 0.5) + (result.actionability * 0.5);

    return {
      passed: average >= input.threshold,
      scores: {
        completeness: result.completeness,
        accuracy: 3, // not evaluated — neutral default
        actionability: result.actionability,
        formatting: 3, // not evaluated — neutral default
        average: Math.round(average * 100) / 100,
      },
      feedback: average >= input.threshold
        ? "Output meets quality standards."
        : result.feedback || "Output quality is below threshold.",
    };
  } catch {
    // Non-blocking: return passing result on failure
    return {
      passed: true,
      scores: { completeness: 3, accuracy: 3, actionability: 3, formatting: 3, average: 3 },
      feedback: "Lightweight judge encountered an error, passing by default.",
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function buildOutputSummary(output: AgentOutput): string {
  const parts: string[] = [];

  if (output.summary) {
    parts.push(`Summary: ${output.summary}`);
  }

  if (output.documents) {
    for (const doc of output.documents) {
      // Truncate content for judging (we don't need the full document)
      const preview = doc.content.slice(0, 1500);
      parts.push(`Document "${doc.title}" (${doc.type}):\n${preview}`);
    }
  }

  if (output.leads && output.leads.length > 0) {
    parts.push(`Leads found: ${output.leads.length}`);
    for (const lead of output.leads.slice(0, 3)) {
      parts.push(`- ${lead.name} at ${lead.company} (${lead.role || "unknown role"}, score: ${lead.score})`);
    }
  }

  if (output.emails && output.emails.length > 0) {
    for (const email of output.emails) {
      parts.push(`Email to ${email.to}:\nSubject: ${email.subject}\n${email.html.slice(0, 500)}`);
    }
  }

  if (output.tweets && output.tweets.length > 0) {
    for (const tweet of output.tweets) {
      parts.push(`Tweet (${tweet.content.length} chars): ${tweet.content}`);
    }
  }

  if (output.pages && output.pages.length > 0) {
    for (const page of output.pages) {
      parts.push(`Page "${page.title}":\n${page.html.slice(0, 1000)}`);
    }
  }

  return parts.join("\n\n") || output.summary || "No output content.";
}
