import { createHash } from "node:crypto";
import type { AgentInput, AgentOutput } from "./types";
import { generateMission } from "@/lib/ai/research/mission-generator";
import { generateMarketResearch } from "@/lib/ai/research/market-researcher";
import { generateAgentCompletion, generateAgentJSON } from "@/lib/ai/agent-model-router";
import type { ProjectMemory } from "@/lib/memory";
import { summarizeContentForMemory } from "@/lib/personalization";
import {
  searchWebMulti,
  buildLeadResearchQueries,
  buildGeneralResearchQueries,
  formatSearchContext,
} from "@/lib/search";
import { getSearchEngine } from "@/config/search-engines";
import { runAgentic } from "./framework/agentic-runner";
import { validateOutput } from "./framework/validation";
import { getAgenticConfigForSource } from "@/config/agent-agentic-config";
import { getAgentModelConfig } from "@/config/agent-models";

type ResearchSubtype =
  | "mission"
  | "market_research"
  | "update_document"
  | "lead_research"
  | "general_research";

interface LeadResearchResponse {
  title: string;
  content: string;
  leads: { name: string; company: string; role?: string; why: string; url?: string }[];
  keyFindings: string[];
}

interface GeneralResearchResponse {
  title: string;
  content: string;
  keyFindings: string[];
}

interface ResearchRequest {
  subtype: ResearchSubtype;
  documentType: string;
}

const INLINE_DATA_RULES = `Data presentation rules (CRITICAL — follow these exactly):
- This document must be completely self-contained. All data, metrics, and comparisons must be embedded directly in the markdown.
- Use markdown tables extensively for comparisons, metrics, breakdowns, and any structured data
- Include a \`## Key Metrics Snapshot\` section with a detailed markdown table (columns: Metric, Value, Context)
- Use bold text for key numbers and takeaways within paragraphs
- Do NOT reference external charts or visuals — all data must be inline as tables and formatted text
- When comparing items (competitors, channels, personas, etc.), always use a markdown table, never just a list`;

export async function runResearchAgent(input: AgentInput): Promise<AgentOutput> {
  const progress = input.onProgress || (() => {});
  try {
    const memory = parseMemoryFromContext(input.context);
    progress("Analyzing your request...");
    const request = resolveResearchRequest(
      input.prompt,
      typeof input.metadata?.researchType === "string" ? input.metadata.researchType : undefined
    );

    switch (request.subtype) {
      case "mission": {
        progress("Writing mission document...");
        const result = await generateMission(input.prompt, memory, input.metadata?.userBackground as string);
        return {
          success: true,
          agent: "research",
          summary: `Generated mission document: "${result.title}"`,
          documents: [{ type: "mission", title: result.title, content: result.content, metadata: result.metadata }],
          supermemoryIngestions: [{
            content: buildMissionMemorySummary(result.title, input.prompt, result.content),
            customId: `mission_${input.projectId}`,
            dedupeKey: `mission_${input.projectId}`,
            metadata: { type: "mission_document" },
          }],
          links: [{ label: "View mission", url: "#research" }],
        };
      }

      case "market_research": {
        progress("Researching market landscape...");
        const result = await generateMarketResearch(input.prompt, memory);
        return {
          success: true,
          agent: "research",
          summary: `Market research complete — found ${result.metadata.competitors?.length || 0} competitors, ${result.metadata.gaps?.length || 0} market gaps`,
          documents: [{
            type: "market_research",
            title: result.title,
            content: result.content,
            metadata: result.metadata as unknown as Record<string, unknown>,
          }],
          supermemoryIngestions: [{
            content: buildMarketResearchMemorySummary(result.title, result.content, result.metadata),
            customId: `market_research_${input.projectId}`,
            dedupeKey: `market_research_${input.projectId}`,
            metadata: { type: "market_research" },
          }],
          links: [{ label: "View research", url: "#research" }],
        };
      }

      case "lead_research": {
        return runAgenticResearch(input, "lead_research", buildLeadResearchSystemPrompt(input));
      }

      case "update_document": {
        progress("Reviewing existing document and applying changes...");
        const updated = await generateAgentCompletion(
          "research",
          `You are a senior startup strategist updating a company document based on founder feedback.

Instructions:
1. Carefully read the existing company context to understand the current document's state and content
2. Identify precisely what the user wants to change — be specific about scope (one section vs full rewrite)
3. Rewrite the document incorporating their feedback while preserving the overall structure, tone, and Markdown formatting
4. Make changes feel natural and integrated — not patched on top of existing text
5. Keep the same section headers and document structure unless the user explicitly asked to change them
6. If the document is research-heavy, preserve the metrics-first structure and data-oriented tone
7. Use markdown tables for all comparisons and structured data
8. Output ONLY the updated document content in Markdown — no preamble, no commentary

Existing company context:
${input.context}`,
          input.prompt,
          { maxTokens: 4500 }
        );

        return {
          success: true,
          agent: "research",
          summary: `Updated ${request.documentType} document with requested changes`,
          documents: [{ type: request.documentType, title: `${formatDocumentLabel(request.documentType)} (updated)`, content: updated }],
          supermemoryIngestions: [{
            content: buildUpdatedDocumentMemorySummary(request.documentType, updated),
            customId: `${request.documentType}_${input.projectId}_${stablePromptHash(input.prompt)}`,
            dedupeKey: `${request.documentType}:${input.projectId}:${stablePromptHash(input.prompt)}`,
            metadata: { type: request.documentType, updated: true },
          }],
          links: [{ label: `View ${formatDocumentLabel(request.documentType)}`, url: "#research" }],
        };
      }

      default: {
        const blueprint = getResearchBlueprint(request.documentType);
        return runAgenticResearch(input, request.documentType, buildGeneralResearchSystemPrompt(input, blueprint));
      }
    }
  } catch (error) {
    return {
      success: false,
      agent: "research",
      summary: "Research failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function parseMemoryFromContext(context: string): ProjectMemory {
  return {
    companyName: extractField(context, "Company") || undefined,
    companyDescription: extractField(context, "Description") || "",
    tagline: extractField(context, "Tagline") || undefined,
    mission: extractField(context, "Mission") || undefined,
    targetAudience: extractField(context, "Target Audience") || extractField(context, "Audience") || undefined,
    competitors: undefined,
    keyInsights: undefined,
  };
}

function extractField(context: string, field: string): string | undefined {
  const regex = new RegExp(`${field}:\\s*(.+?)(?:\\n|$)`, "i");
  const match = context.match(regex);
  return match?.[1]?.trim();
}

function resolveResearchRequest(prompt: string, requestedType?: string): ResearchRequest {
  const normalizedType = normalizeResearchType(requestedType);
  const subtype = classifyResearchType(prompt, normalizedType);

  if (subtype === "mission") {
    return { subtype, documentType: "mission" };
  }
  if (subtype === "market_research") {
    return { subtype, documentType: "market_research" };
  }
  if (subtype === "lead_research") {
    return { subtype, documentType: "lead_research" };
  }

  return {
    subtype,
    documentType: detectDocumentType(prompt, normalizedType),
  };
}

function normalizeResearchType(value?: string): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

function classifyResearchType(prompt: string, requestedType?: string): ResearchSubtype {
  if (requestedType === "mission") return "mission";
  if (requestedType === "market_research") return "market_research";
  if (requestedType === "lead_research") return "lead_research";

  const lower = prompt.toLowerCase();
  if (lower.includes("update") || lower.includes("rewrite") || lower.includes("revise") || lower.includes("change the")) {
    return "update_document";
  }
  if (lower.includes("mission") || lower.includes("vision statement") || lower.includes("company strategy")) {
    return "mission";
  }
  if (lower.includes("lead") || lower.includes("prospect") || lower.includes("find companies") || lower.includes("target companies") || lower.includes("potential customer")) {
    return "lead_research";
  }
  if (lower.includes("market research") || lower.includes("tam") || lower.includes("sam") || lower.includes("som")) {
    return "market_research";
  }
  return "general_research";
}

function detectDocumentType(prompt: string, requestedType?: string): string {
  if (requestedType && requestedType !== "research") return requestedType;

  const lower = prompt.toLowerCase();
  if (lower.includes("mission")) return "mission";
  if (lower.includes("market")) return "market_research";
  if (lower.includes("competitor")) return "competitor_analysis";
  if (lower.includes("lead")) return "lead_research";
  if (lower.includes("customer")) return "customer_research";
  if (lower.includes("audience")) return "target_audience";
  if (lower.includes("trend")) return "market_trends";
  if (lower.includes("pricing")) return "pricing_research";
  if (lower.includes("content")) return "content_research";
  if (lower.includes("ad") || lower.includes("advertising")) return "ads_research";
  return "research";
}

function formatDocumentLabel(docType: string): string {
  return docType.replace(/_/g, " ");
}

function getResearchBlueprint(documentType: string): {
  label: string;
  sections: string[];
  tableFocus: string;
} {
  const baseSections = [
    "# <specific research title>",
    "## Executive Summary",
    "## Key Metrics Snapshot",
  ];

  switch (documentType) {
    case "competitor_analysis":
      return {
        label: "competitor analysis",
        sections: [
          ...baseSections,
          "## Competitive Set",
          "## Feature & Positioning Breakdown",
          "## Pricing & Packaging",
          "## Strategic Risks",
          "## Recommendations",
        ],
        tableFocus: "Include a full competitor comparison table (Company, Focus, Strengths, Weaknesses, Pricing), a feature matrix table, and a pricing tier comparison table.",
      };
    case "customer_research":
      return {
        label: "customer research",
        sections: [
          ...baseSections,
          "## Audience Breakdown",
          "## Pain Points & Buying Triggers",
          "## Journey Friction",
          "## Recommendations",
        ],
        tableFocus: "Include a persona comparison table (Persona, Size, Pain Points, Budget, Buying Trigger), a pain-point severity table, and a jobs-to-be-done table.",
      };
    case "target_audience":
      return {
        label: "target audience research",
        sections: [
          ...baseSections,
          "## Audience Breakdown",
          "## Behaviors & Preferences",
          "## Channel Strategy",
          "## Recommendations",
        ],
        tableFocus: "Include an audience segment table (Segment, Size, Demographics, Behaviors, Best Channel), a channel effectiveness comparison table, and a segment priority ranking table.",
      };
    case "market_trends":
      return {
        label: "market trends research",
        sections: [
          ...baseSections,
          "## Trend Landscape",
          "## Growth Signals",
          "## Opportunity Windows",
          "## Recommendations",
        ],
        tableFocus: "Include a trend comparison table (Trend, Growth Rate, Maturity, Implication), a growth signals table with timeline estimates, and an opportunity sizing table.",
      };
    case "pricing_research":
      return {
        label: "pricing research",
        sections: [
          ...baseSections,
          "## Pricing Landscape",
          "## Packaging Patterns",
          "## Buyer Sensitivity",
          "## Recommendations",
        ],
        tableFocus: "Include a competitor pricing table (Company, Plans, Price Range, Key Differentiator), a packaging patterns table, and a recommended pricing strategy table.",
      };
    case "content_research":
      return {
        label: "content strategy research",
        sections: [
          ...baseSections,
          "## Topic Landscape",
          "## Channel Opportunities",
          "## Content Gaps",
          "## Recommendations",
        ],
        tableFocus: "Include a channel comparison table (Channel, Audience Fit, Effort, Expected Impact), a topic cluster table, and a content gap analysis table.",
      };
    case "ads_research":
      return {
        label: "ads research",
        sections: [
          ...baseSections,
          "## Channel Landscape",
          "## Budget Allocation",
          "## Creative & Targeting Signals",
          "## Recommendations",
        ],
        tableFocus: "Include a platform comparison table (Platform, Audience, Cost Range, Best For), a budget allocation breakdown table, and a targeting strategy table.",
      };
    default:
      return {
        label: formatDocumentLabel(documentType),
        sections: [
          ...baseSections,
          "## Findings",
          "## Analysis",
          "## Recommendations",
        ],
        tableFocus: "Include at least one comparison table, one data summary table, and one recommendations priority table.",
      };
  }
}

function stablePromptHash(prompt: string): string {
  return createHash("sha256")
    .update(prompt.trim().toLowerCase())
    .digest("hex")
    .slice(0, 12);
}

function buildMissionMemorySummary(title: string, companyPrompt: string, content: string): string {
  return [
    `Mission document: ${title}`,
    `Company idea: ${companyPrompt}`,
    `Summary: ${summarizeContentForMemory(content, 700)}`,
  ].join("\n");
}

function buildMarketResearchMemorySummary(
  title: string,
  content: string,
  metadata: {
    competitors?: Array<{ name: string }>;
    gaps?: string[];
    targetMarketSize?: string;
    keyTrends?: string[];
  }
): string {
  return [
    `Market research: ${title}`,
    metadata.targetMarketSize ? `Market Size: ${metadata.targetMarketSize}` : "",
    metadata.competitors?.length ? `Competitors: ${metadata.competitors.map((item) => item.name).slice(0, 5).join(", ")}` : "",
    metadata.gaps?.length ? `Key Gaps: ${metadata.gaps.slice(0, 4).join(" | ")}` : "",
    metadata.keyTrends?.length ? `Trends: ${metadata.keyTrends.slice(0, 4).join(" | ")}` : "",
    `Summary: ${summarizeContentForMemory(content, 700)}`,
  ].filter(Boolean).join("\n");
}

function buildLeadResearchMemorySummary(
  title: string,
  leads: Array<{ name: string; company: string; role?: string; why: string }>,
  keyFindings: string[]
): string {
  const topLeads = leads
    .slice(0, 5)
    .map((lead) => `${lead.name || "Unknown"} at ${lead.company}${lead.role ? ` (${lead.role})` : ""} — ${lead.why}`)
    .join(" | ");

  return [
    `Lead research: ${title}`,
    keyFindings.length ? `Key Findings: ${keyFindings.slice(0, 4).join(" | ")}` : "",
    topLeads ? `Priority Leads: ${topLeads}` : "",
  ].filter(Boolean).join("\n");
}

function buildUpdatedDocumentMemorySummary(docType: string, content: string): string {
  return [
    `Document updated: ${docType.replace(/_/g, " ")}`,
    `Summary: ${summarizeContentForMemory(content, 700)}`,
  ].join("\n");
}

function buildGeneralResearchMemorySummary(title: string, content: string, keyFindings: string[]): string {
  return [
    `Research report: ${title}`,
    keyFindings.length ? `Key Findings: ${keyFindings.slice(0, 5).join(" | ")}` : "",
    `Summary: ${summarizeContentForMemory(content, 700)}`,
  ].filter(Boolean).join("\n");
}

// ── Agentic Research (ReAct loop with tools) ────────────────────────

function buildLeadResearchSystemPrompt(input: AgentInput): string {
  return `You are a world-class B2B sales researcher finding high-quality leads for an early-stage startup. You have access to web search, URL extraction, and memory tools — use them proactively and strategically.

RESEARCH PLANNING:
Before your first web_search, plan your research in 3-5 phases in your thinking. Each phase builds on the previous:
- Phase 1: Understand the company (query_memory) and identify target personas
- Phase 2: Platform-specific pain signal searches (Reddit, Twitter, forums)
- Phase 3: Decision-maker and company searches (LinkedIn, company pages)
- Phase 4: Cross-reference and verify leads across platforms
- Phase 5: Deep-dive on highest-potential leads (extract_url)

QUERY CRAFTING RULES (CRITICAL):
- Never search the raw user prompt verbatim. Decompose into specific sub-questions.
- Use site: operators for platform-specific searches (site:reddit.com, site:linkedin.com/in/, site:twitter.com)
- Append year filters: "2025 2026" for recency
- Use pain-signal keywords: "frustrated OR need OR looking for OR help OR alternative OR switching from"
- Use decision-maker keywords: "CEO OR CTO OR VP OR Head of OR founder"
- After each search round, craft follow-up queries that fill gaps from the first round

EFFICIENCY: When searching multiple independent topics, call web_search multiple times in a SINGLE response. They execute in parallel — saves time.

Your workflow:
1. Use query_memory to understand what this company does, who it serves, what problem it solves
2. Search Reddit, Twitter/X, Indie Hackers, and forums for people COMPLAINING about the exact problem
3. Search for companies and decision-makers in the target market via LinkedIn and company directories
4. Use extract_url to read promising threads and profiles for context and contact info
5. Cross-reference: if you find someone on one platform, search for them on others
6. Synthesize into a report with scored, actionable leads

Lead research standards:
- Only include real companies and people you found via web search — NEVER fabricate leads
- For each lead, explain exactly why they are a good fit (role, pain point, buying signal)
- Prioritize decision-makers with buying authority (CEO, CTO, VP, Head of X)
- Include company website or LinkedIn URL when found
- Group leads by persona type or company segment
${INLINE_DATA_RULES}
- Include a lead comparison table with columns: Name, Company, Role, Why They Fit, URL
- Include an outreach priority table ranking leads by fit score

SOURCE TRIANGULATION:
- For every key claim about a lead, note the source URL where you found them
- If a lead appears on multiple platforms, this dramatically increases their quality
- Flag leads found on 2+ platforms as "multi_platform: true"

Your final output MUST be JSON with:
- title: specific report title (e.g. "Lead Research: 12 B2B SaaS CTOs for DevOps Automation")
- content: full Markdown report with sections: Executive Summary, Key Metrics Snapshot, Target Personas, Lead List, Outreach Prioritization, Suggested First Message Angles
- leads: array of {name, company, role, why, url} — top 8-15 leads
- keyFindings: array of 3-5 actionable insights
- entities: { competitors: [{name, url, strength, weakness}], people: [{name, role, company}], marketSegments: [{name, size, growth}] }
- summary: one-line summary of results

Return ONLY valid JSON — no markdown fences, no explanation outside the JSON.`;
}

function buildGeneralResearchSystemPrompt(
  input: AgentInput,
  blueprint: { label: string; sections: string[]; tableFocus: string },
): string {
  return `You are a world-class research analyst embedded in a startup. You have access to web search, URL extraction, and memory tools — use them strategically to produce frontier-quality research.

RESEARCH PLANNING:
Before your first web_search, plan your research in 3-5 phases in your thinking. Each phase builds on the previous:
- Phase 1: Understand existing context (query_memory) and identify knowledge gaps
- Phase 2: Broad landscape search (market size, major players, trends)
- Phase 3: Deep-dive on most relevant findings (extract_url on key pages)
- Phase 4: Fill gaps and cross-reference claims from multiple sources
- Phase 5: Synthesize with confidence scoring

QUERY CRAFTING RULES (CRITICAL):
- Never search the raw user prompt verbatim. Decompose it into 3-5 specific sub-questions.
- Use site: operators for domain-specific searches (site:reddit.com for community sentiment, site:crunchbase.com for funding data)
- Use date operators: append "2025 2026" for recency
- Use comparison queries: "[Company A] vs [Company B]" or "[category] alternatives comparison"
- For market sizing: "[industry] market size TAM SAM 2025 2026"
- For competitors: "[category] alternatives top companies" and "[category] market leaders"
- After each search round, identify gaps and craft follow-up queries that fill them specifically

EFFICIENCY: When searching multiple independent topics, call web_search multiple times in a SINGLE response. They execute in parallel — saves time.

Your workflow:
1. Use query_memory to check existing company context and prior research
2. Use web_search 3-5 times with strategically different queries to gather comprehensive data
3. Use extract_url to read the most relevant pages in full detail (up to 5 URLs per call)
4. Use find_similar to discover competitors or related companies
5. After initial round, identify gaps and run targeted follow-up searches
6. Synthesize ALL gathered data into a comprehensive research report

Research type: ${blueprint.label}

SOURCE TRIANGULATION (CRITICAL):
- For every key claim (market size, competitor position, trends), track how many independent sources confirm it
- Mark claims as: [HIGH CONFIDENCE] (3+ independent sources), [MEDIUM CONFIDENCE] (2 sources), [LOW CONFIDENCE] (1 source only)
- If sources CONTRADICT each other, explicitly note the disagreement and state which source is more authoritative and why
- Include a ## Source Confidence section at the end of your report with a table: Claim | Sources | Confidence Level

Research standards:
- Ground every claim in your web research — cite specific names, URLs, numbers from live sources
- Every insight must be actionable — not "the market is growing" but "here's what to do about it"
- Be specific: use real names, examples, data points — no vague generalities
- Focus on what the founding team can act on in the next 30-90 days
${INLINE_DATA_RULES}
${blueprint.tableFocus}

Your final output MUST be JSON with:
- title: clear, specific report title
- content: full Markdown research report using these headings:
${blueprint.sections.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}
  N. ## Source Confidence
- keyFindings: array of 3-5 concise, actionable takeaways
- entities: { competitors: [{name, url, strength, weakness}], people: [{name, role, company}], marketSegments: [{name, size, growth}] }
- summary: one-line summary of results

Return ONLY valid JSON — no markdown fences, no explanation outside the JSON.`;
}

async function runAgenticResearch(
  input: AgentInput,
  documentType: string,
  systemPrompt: string,
): Promise<AgentOutput> {
  const progress = input.onProgress || (() => {});
  const source = (input.metadata?.executionSource as "pipeline" | "chat") || "chat";
  const config = getAgenticConfigForSource("research", source);
  const modelConfig = getAgentModelConfig("research");

  progress("Starting agentic research...");

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

  // If the agentic runner produced documents, enrich with memory ingestion
  if (result.success && result.documents && result.documents.length > 0) {
    const doc = result.documents[0];
    const title = doc.title || `${documentType} research`;
    const content = doc.content || result.summary;
    const keyFindings = (doc.metadata?.keyFindings as string[]) || [];

    result.supermemoryIngestions = [{
      content: documentType === "lead_research"
        ? buildLeadResearchMemorySummary(
            title,
            (doc.metadata?.leads as Array<{ name: string; company: string; role?: string; why: string }>) || [],
            keyFindings,
          )
        : buildGeneralResearchMemorySummary(title, content, keyFindings),
      customId: `${documentType}_${input.projectId}_${stablePromptHash(input.prompt)}`,
      dedupeKey: `${documentType}:${input.projectId}:${stablePromptHash(input.prompt)}`,
      metadata: { type: documentType },
    }];

    result.links = [{
      label: documentType === "lead_research" ? "View leads" : `View ${documentType.replace(/_/g, " ")}`,
      url: documentType === "lead_research" ? "#leads" : "#research",
    }];

    // Write key findings to scratchpad for downstream agents
    if (input.scratchpad && keyFindings.length > 0) {
      input.scratchpad.write(`research.${documentType}.keyFindings`, keyFindings);
      input.scratchpad.write(`research.${documentType}.title`, title);
    }

    // Write extracted entities to scratchpad for downstream agents
    const entities = doc.metadata?.entities as Record<string, unknown> | undefined;
    if (input.scratchpad && entities) {
      input.scratchpad.write(`research.${documentType}.entities`, entities);
    }
  }

  return result;
}
