import { createHash } from "node:crypto";
import type { AgentInput, AgentOutput } from "./types";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { searchWebMulti, buildLeadFinderQueries, formatSearchContext } from "@/lib/search";
import { getSearchEngine } from "@/config/search-engines";
import { summarizeContentForMemory } from "@/lib/personalization";
import { runAgentic } from "./framework/agentic-runner";
import { validateOutput } from "./framework/validation";
import { getAgenticConfigForSource } from "@/config/agent-agentic-config";
import { getAgentModelConfig } from "@/config/agent-models";
import { scoreLead, type LeadSignals } from "@/lib/lead-scoring";
import { buildICPContext } from "@/lib/icp-profile";

interface LeadFinderLead {
  name: string;
  email?: string;
  linkedin_url?: string;
  company: string;
  role?: string;
  phone?: string;
  website?: string;
  why: string;
  score: number;
  tags?: string[];
}

interface LeadFinderResponse {
  title: string;
  content: string;
  leads: LeadFinderLead[];
  keyFindings: string[];
}

const INLINE_DATA_RULES = `Data presentation rules (CRITICAL — follow these exactly):
- This document must be completely self-contained. All data, metrics, and comparisons must be embedded directly in the markdown.
- Use markdown tables extensively for comparisons, metrics, breakdowns, and any structured data
- Include a \`## Key Metrics Snapshot\` section with a detailed markdown table (columns: Metric, Value, Context)
- Use bold text for key numbers and takeaways within paragraphs
- Do NOT reference external charts or visuals — all data must be inline as tables and formatted text
- When comparing items (competitors, channels, personas, etc.), always use a markdown table, never just a list`;

export async function runLeadFinderAgent(input: AgentInput): Promise<AgentOutput> {
  const progress = input.onProgress || (() => {});
  const source = (input.metadata?.executionSource as "pipeline" | "chat") || "chat";
  const config = getAgenticConfigForSource("lead_finder", source);
  const modelConfig = getAgentModelConfig("lead_finder");

  try {
    progress("Starting agentic lead search...");

    // Build ICP context from past lead interactions (if available)
    let icpContext = "";
    try {
      icpContext = await buildICPContext(input.projectId);
    } catch {
      // ICP lookup is non-critical — continue without it
    }

    const systemPrompt = `You are the world's best customer discovery researcher for early-stage startups. You find REAL people who are actively experiencing the problem this company solves. You have access to web search, URL extraction, and memory tools — use them strategically.

RESEARCH PLANNING:
Before your first web_search, plan your research in 4-5 phases in your thinking:
- Phase 1: Understand the company (query_memory) — what it does, who it serves, what problem it solves
- Phase 2: Community pain signals — search Reddit, Twitter, Indie Hackers for people complaining about the exact problem
- Phase 3: Decision-maker search — LinkedIn, company pages, team directories in the target market
- Phase 4: Competitor customer mining — find people switching away from or complaining about competitors
- Phase 5: Cross-reference and verify — check leads across multiple platforms, extract_url for deep context

QUERY CRAFTING RULES (CRITICAL):
- Never search the raw user prompt verbatim. Decompose into targeted sub-queries.
- Use site: operators for platform-specific searches:
  "site:reddit.com [problem] frustrated OR need OR help OR looking for"
  "site:twitter.com [problem] anyone know OR recommendation OR struggling"
  "site:indiehackers.com [problem]"
  "site:linkedin.com/in/ [industry] [role] [company type]"
- Append "2025 2026" for recency on market/trend searches
- After each search round, craft follow-up queries that fill gaps from initial results

EFFICIENCY: Call web_search multiple times in a SINGLE response when searching independent topics. They execute in parallel.

COMPETITOR CUSTOMER MINING:
1. Use query_memory to find known competitors from previous research
2. Search for people SWITCHING AWAY from competitors: "[competitor] alternative OR switching from OR leaving OR canceling"
3. Search for competitor complaint threads: "[competitor] terrible OR broken OR expensive OR worst"
4. These are your HIGHEST-INTENT leads — they already have budget and are actively looking

CROSS-PLATFORM STRATEGY:
1. Search each platform separately with tailored queries
2. For any person found on one platform, search for them on OTHER platforms to build a complete profile
3. Mark leads found on 2+ platforms as multi_platform: true — these are highest priority

LEAD QUALITY RULES:
- Every lead MUST be a real person or company found via your web searches. NEVER fabricate leads.
- PRIORITIZE people who have publicly expressed the pain point (Reddit posts, tweets, forum threads)
- Include the SOURCE URL where you found them (Reddit thread, tweet, forum post)
- Each lead must include: name (or username), company/context, and a clear "why" explaining fit
- Include email, LinkedIn URL, Twitter handle, Reddit username, and source URL when found
- Tag each lead with categories: "active-pain", "decision-maker", "early-adopter", "high-intent", "competitor-refugee", "multi-platform"
- Aim for 10-20 high-quality leads, with at least 5 from community sources (Reddit, Twitter, forums)

LEAD SCORING SIGNALS (provide these instead of a raw score):
For each lead, provide signal data that will be used for deterministic scoring:
- pain_expression: 0-1 (0 = no public pain, 0.5 = mentioned problem, 1 = explicitly said "I need this")
- authority: 0-1 (0 = unknown, 0.3 = IC, 0.5 = manager, 0.7 = director, 1 = C-suite/VP/founder)
- relevance: 0-1 (0 = tangential, 0.5 = related, 1 = exact problem match)
- recency_days: number of days since their post/activity (0 = today, 7 = this week, 30 = this month)
- company_fit: 0-1 (0 = wrong segment, 0.5 = adjacent, 1 = perfect ICP match)
- multi_platform: true/false (found on 2+ platforms)
${INLINE_DATA_RULES}

Your final output MUST be JSON with:
- title: specific report title (e.g. "18 Freelancers Actively Seeking Marketing Automation")
- content: full Markdown report with sections: Executive Summary, Key Metrics Snapshot, Target Profile, Community Signals (what people are saying about this problem), Lead Directory (table with source URLs), Outreach Prioritization, Suggested First Message Angles (personalized to their expressed pain)
- leads: array of { name, company, role, email, linkedin_url, phone, website, why, score, tags, source_url, signals: { pain_expression, authority, relevance, recency_days, company_fit, multi_platform } }
- keyFindings: 3-5 actionable insights including common pain points found
- summary: one-line summary of results

Return ONLY valid JSON — no markdown fences, no explanation outside the JSON.${icpContext}`;

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

    // Structure leads from the agent output with deterministic scoring
    if (result.success && result.leads?.length) {
      result.leads = result.leads.map((lead) => {
        const rawSignals = (lead as Record<string, unknown>).signals as Record<string, unknown> | undefined;

        // If the agent provided signal data, use deterministic scoring
        let finalScore = Math.max(0, Math.min(100, lead.score));
        let scoreBreakdown: Record<string, number> | undefined;
        if (rawSignals) {
          const signals: LeadSignals = {
            painExpression: Number(rawSignals.pain_expression) || 0,
            authority: Number(rawSignals.authority) || 0,
            relevance: Number(rawSignals.relevance) || 0,
            recencyDays: Number(rawSignals.recency_days) || 30,
            companyFit: Number(rawSignals.company_fit) || 0,
            multiPlatform: Boolean(rawSignals.multi_platform),
          };
          const scored = scoreLead(signals);
          finalScore = scored.score;
          scoreBreakdown = scored.breakdown;
        }

        // Verification: flag leads without external references
        const hasVerifiableSource = !!(lead.linkedin_url || lead.website || (lead as Record<string, unknown>).source_url);
        const hasIdentity = !!(lead.name && lead.name !== "Unknown" && lead.company && lead.company !== "Unknown");
        const verified = hasVerifiableSource && hasIdentity;
        const tags = [...(lead.tags || [])];
        if (!verified && !tags.includes("needs_verification")) {
          tags.push("needs_verification");
        }

        return {
          ...lead,
          source: "lead_finder",
          score: finalScore,
          tags,
          metadata: {
            ...(lead as Record<string, unknown>).metadata as Record<string, unknown> | undefined,
            signals: rawSignals,
            scoreBreakdown,
            verified,
          },
        };
      });
    }

    // No leads found — make it explicit in the summary
    if (result.success && (!result.leads || result.leads.length === 0)) {
      result.summary = result.summary
        ? `${result.summary} No matching leads were found — try adjusting your search criteria or target audience.`
        : "The search completed but no matching leads were found. Try broadening your search criteria or targeting a different audience.";
      result.links = [];
    }

    // Add memory ingestion
    if (result.success && result.documents?.length) {
      const doc = result.documents[0];
      const leads = (result.leads || []) as LeadFinderLead[];
      const keyFindings = (doc.metadata?.keyFindings as string[]) || [];

      result.supermemoryIngestions = [{
        content: buildLeadFinderMemorySummary(doc.title, leads, keyFindings),
        customId: `lead_finder_${input.projectId}_${stableHash(input.prompt)}`,
        dedupeKey: `lead_finder:${input.projectId}:${stableHash(input.prompt)}`,
        metadata: { type: "lead_finder" },
      }];
      result.links = [{ label: "View leads", url: "#leads" }];

      // Write to scratchpad for downstream agents
      if (input.scratchpad && leads.length > 0) {
        input.scratchpad.write("lead_finder.leadCount", leads.length);
        input.scratchpad.write("lead_finder.topLeads", leads.slice(0, 5).map((l) => `${l.name} at ${l.company}`));
      }
    }

    return result;
  } catch (error) {
    return {
      success: false,
      agent: "lead_finder",
      summary: "Lead search failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function stableHash(prompt: string): string {
  return createHash("sha256").update(prompt.trim().toLowerCase()).digest("hex").slice(0, 12);
}

function buildLeadFinderMemorySummary(
  title: string,
  leads: LeadFinderLead[],
  keyFindings: string[]
): string {
  const topLeads = leads
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((l) => `${l.name} at ${l.company}${l.role ? ` (${l.role})` : ""} — ${l.why}`)
    .join(" | ");

  return [
    `Lead finder results: ${title}`,
    keyFindings.length ? `Key Findings: ${keyFindings.slice(0, 4).join(" | ")}` : "",
    topLeads ? `Top Leads: ${topLeads}` : "",
  ].filter(Boolean).join("\n");
}
