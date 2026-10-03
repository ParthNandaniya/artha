import { createHash } from "node:crypto";
import type { AgentInput, AgentOutput } from "./types";
import { runAgentic } from "./framework/agentic-runner";
import { validateOutput } from "./framework/validation";
import { getAgenticConfigForSource } from "@/config/agent-agentic-config";
import { getAgentModelConfig } from "@/config/agent-models";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import {
  createCampaign,
  addLeadsToCampaign,
  isInstantlyConfigured,
  type InstantlySequenceStep,
  type InstantlyLead,
} from "@/lib/instantly";

interface SequenceStepDraft {
  step_number: number;
  subject: string;
  body_html: string;
  delay_days: number;
  angle: string; // Brief description of the approach for this step
}

interface LeadSequenceDraft {
  lead_name: string;
  lead_email: string;
  lead_company: string;
  lead_role: string;
  personalization_notes: string;
  steps: SequenceStepDraft[];
}

interface SequencePlan {
  sequences: LeadSequenceDraft[];
  strategy: string;
  summary: string;
}

export async function runSalesSequencerAgent(input: AgentInput): Promise<AgentOutput> {
  try {
    const progress = input.onProgress || (() => {});
    const source = (input.metadata?.executionSource as "pipeline" | "chat") || "chat";
    const config = getAgenticConfigForSource("sales_sequencer", source);
    const modelConfig = getAgentModelConfig("sales_sequencer");

    progress("Building personalized outreach sequences...");

    // Read leads from scratchpad if available (from upstream lead_finder)
    let leadContext = "";
    if (input.scratchpad) {
      const leadCount = input.scratchpad.read("lead_finder.leadCount");
      const topLeads = input.scratchpad.read("lead_finder.topLeads");
      if (leadCount && topLeads) {
        leadContext = `\n\nLEADS FROM PRIOR RESEARCH (${leadCount} total):\n${(topLeads as string[]).join("\n")}`;
      }
    }

    const systemPrompt = `You are an elite B2B sales development representative (SDR) who crafts personalized multi-step email sequences that get replies. You combine deep research with proven outreach frameworks.

You have access to web search, memory tools, and URL extraction. Use them to:
1. query_memory to recall company context, past lead research, and outreach history
2. web_search to research each lead's company, recent news, and potential pain points
3. extract_url to deep-dive into lead profiles (LinkedIn, company pages)

SEQUENCE FRAMEWORK:
Each lead gets a 3-step email sequence:

Step 1 (Day 0) — The Opener:
- Subject: 4-7 words, specific to them (e.g. "quick question about [their initiative]")
- Body: Reference something specific about THEM (not you). Name their likely pain point. One sentence on how you solve it. Low-friction CTA.
- Tone: peer-to-peer, not salesy

Step 2 (Day 3) — The Value Add:
- Subject: reply to step 1 (no new subject)
- Body: Share a specific insight, case study, or data point relevant to their situation. Don't repeat step 1 — add new value. Softer CTA.
- Tone: helpful consultant

Step 3 (Day 7) — The Breakup:
- Subject: reply to thread
- Body: 2-3 sentences max. Acknowledge they're busy. One final specific reason to connect. Easy out ("no worries if timing is off").
- Tone: respectful, human

PERSONALIZATION RULES (CRITICAL):
- Every email must reference something SPECIFIC about the lead (their company, role, recent post, industry challenge)
- Generic templates will be rejected. Personalization > volume.
- Research each lead before writing — use web_search and extract_url
- Sign-off: use the founder's real first name from company context. NEVER use placeholders.
- Keep subject lines under 50 characters
- Keep each email body under 150 words
- NO: "I hope this email finds you well", "We are a revolutionary platform", "I wanted to reach out"
${leadContext}

Your final output MUST be JSON with:
- strategy: overall outreach approach and targeting rationale (2-3 sentences)
- sequences: array of { lead_name, lead_email, lead_company, lead_role, personalization_notes, steps: [{ step_number, subject, body_html, delay_days, angle }] }
- summary: one-line summary of what was created

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
    if (!result.success) return result;

    // Extract sequence plan from output
    const plan = extractSequencePlan(result);
    if (!plan || plan.sequences.length === 0) {
      return {
        ...result,
        summary: result.summary || "Sequence plan created but no sequences were generated",
      };
    }

    // ── Critique pass: evaluate each generated email ──
    const critiqueFeedback = await critiqueSequences(plan);
    if (critiqueFeedback) {
      result.summary = `${result.summary || ""} | Quality critique: ${critiqueFeedback}`;
    }

    // Structure outreach sequences for downstream processing
    result.outreachSequences = plan.sequences.map((seq) => ({
      lead_name: seq.lead_name,
      lead_email: seq.lead_email,
      lead_company: seq.lead_company,
      steps: seq.steps.map((s) => ({
        step_number: s.step_number,
        subject: s.subject,
        body_html: s.body_html,
        delay_days: s.delay_days,
      })),
    }));

    // Also emit as emails needing confirmation (step 1 of each sequence)
    result.emails = plan.sequences.map((seq) => ({
      to: seq.lead_email,
      subject: seq.steps[0]?.subject || "Outreach",
      html: seq.steps[0]?.body_html || "",
      needsConfirmation: true,
    }));

    // Create task for tracking
    result.tasksCreated = [{
      title: `Send outreach to ${plan.sequences.length} leads`,
      description: plan.strategy,
      type: "outreach",
      tag: "cold-outreach",
      agent: "sales_sequencer",
    }];

    // If Instantly is configured, optionally create the campaign
    if (isInstantlyConfigured() && input.metadata?.autoCreateCampaign) {
      progress("Creating campaign in Instantly...");
      try {
        const fromEmail = (input.metadata?.fromEmail as string) || "";
        if (fromEmail) {
          // Use the first sequence as the campaign template
          const templateSequence = plan.sequences[0];
          if (templateSequence) {
            const campaign = await createCampaign({
              name: `${plan.sequences[0].lead_company} outreach — ${new Date().toISOString().slice(0, 10)}`,
              fromEmail,
              sequences: templateSequence.steps.map((s) => ({
                subject: s.subject,
                body: s.body_html,
                delay_days: s.delay_days,
              })),
            });

            // Add all leads to the campaign
            await addLeadsToCampaign(
              campaign.id,
              plan.sequences.map((seq) => ({
                email: seq.lead_email,
                first_name: seq.lead_name.split(" ")[0],
                last_name: seq.lead_name.split(" ").slice(1).join(" "),
                company_name: seq.lead_company,
                title: seq.lead_role,
              })),
            );

            result.summary = `Created Instantly campaign with ${plan.sequences.length} leads — ${plan.strategy}`;
          }
        }
      } catch (err) {
        // Campaign creation is non-blocking
        progress(`Instantly campaign creation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    result.links = [{ label: "Review sequences", url: "#email" }];
    result.summary = result.summary || `Created ${plan.sequences.length} personalized outreach sequences — ${plan.strategy}`;

    // Memory ingestion
    result.supermemoryIngestions = [{
      content: buildSequenceMemorySummary(plan),
      customId: `sales_sequencer_${input.projectId}_${stableHash(input.prompt)}`,
      dedupeKey: `sales_sequencer:${input.projectId}:${stableHash(input.prompt)}`,
      metadata: { type: "sales_sequencer" },
    }];

    // Write to scratchpad
    if (input.scratchpad) {
      input.scratchpad.write("sales.sequenceCount", plan.sequences.length);
      input.scratchpad.write("sales.leads", plan.sequences.map((s) => `${s.lead_name} at ${s.lead_company}`));
      input.scratchpad.write("sales.strategy", plan.strategy);
    }

    return result;
  } catch (error) {
    return {
      success: false,
      agent: "sales_sequencer",
      summary: "Sales sequence creation failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ── Critique Pass ────────────────────────────────────────────────────

interface EmailCritiqueScore {
  lead_name: string;
  step_number: number;
  score: number;
  feedback: string;
}

interface CritiqueResult {
  scores: EmailCritiqueScore[];
  overall_feedback: string;
}

async function critiqueSequences(plan: SequencePlan): Promise<string | null> {
  try {
    const emailSummaries = plan.sequences.flatMap((seq) =>
      seq.steps.map((step) => ({
        lead: seq.lead_name,
        company: seq.lead_company,
        step: step.step_number,
        subject: step.subject,
        body_preview: step.body_html.replace(/<[^>]+>/g, "").slice(0, 300),
        angle: step.angle,
      })),
    );

    const critique = await generateAgentJSON<CritiqueResult>(
      "quality_judge",
      `You are an email quality judge. Review these sales outreach email sequences and score each email.

For each email evaluate:
1. Is personalization specific or generic? (references real details about the lead/company)
2. Is the subject line under 50 characters?
3. Is the body under 150 words?
4. Is there a clear, specific CTA?

Return JSON with:
- scores: array of { lead_name, step_number, score (1-5), feedback (one sentence) }
- overall_feedback: 1-2 sentence summary of quality issues found

Score guide: 5=excellent, 4=good, 3=acceptable, 2=needs improvement, 1=poor`,
      `Review these email sequences:\n${JSON.stringify(emailSummaries, null, 2)}`,
      { maxTokens: 2000 },
    );

    const lowScores = critique.scores.filter((s) => s.score < 3);
    if (lowScores.length > 0) {
      const warnings = lowScores
        .map((s) => `${s.lead_name} step ${s.step_number} (${s.score}/5): ${s.feedback}`)
        .join("; ");
      console.warn(`[sales-sequencer] Low quality emails detected: ${warnings}`);
      return `${lowScores.length} email(s) scored below 3/5 — ${critique.overall_feedback}`;
    }

    return null;
  } catch (err) {
    // Critique is non-blocking — log and continue
    console.warn("[sales-sequencer] Critique pass failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

function extractSequencePlan(result: AgentOutput): SequencePlan | null {
  if (!result.documents?.length) return null;

  const doc = result.documents[0];
  const meta = doc.metadata as Record<string, unknown> | undefined;

  if (meta?.sequences && Array.isArray(meta.sequences)) {
    return {
      sequences: meta.sequences as LeadSequenceDraft[],
      strategy: (meta.strategy as string) || "",
      summary: (meta.summary as string) || result.summary,
    };
  }

  try {
    const parsed = JSON.parse(doc.content);
    if (parsed.sequences && Array.isArray(parsed.sequences)) {
      return parsed as SequencePlan;
    }
  } catch {
    // Not JSON
  }

  return null;
}

function stableHash(prompt: string): string {
  return createHash("sha256").update(prompt.trim().toLowerCase()).digest("hex").slice(0, 12);
}

function buildSequenceMemorySummary(plan: SequencePlan): string {
  const leadSummary = plan.sequences
    .slice(0, 5)
    .map((s) => `${s.lead_name} at ${s.lead_company} (${s.lead_role})`)
    .join(" | ");

  return [
    `Sales outreach sequences created: ${plan.sequences.length} leads`,
    `Strategy: ${plan.strategy}`,
    `Leads: ${leadSummary}`,
  ].join("\n");
}
