import { generateAgentCompletion, generateAgentJSON } from "@/lib/ai/agent-model-router";
import { ProjectMemory } from "@/lib/memory";
import {
  searchWebMulti,
  buildMarketResearchQueries,
  formatSearchContext,
  findSimilar,
  formatFindSimilarContext,
} from "@/lib/search";
import { getSearchEngine } from "@/config/search-engines";

export interface MarketResearchMetadata {
  competitors: { name: string; description: string; strengths: string; weaknesses: string }[];
  gaps: string[];
  targetMarketSize: string;
  keyTrends: string[];
}

interface MarketResearchOptions {
  /** "onboarding" = fast single-pass (Sonnet, fewer searches). "deep" = full analysis (Opus, 2 LLM calls). */
  mode?: "onboarding" | "deep";
  companyUrl?: string;
}

export async function generateMarketResearch(
  companyPrompt: string,
  memory: ProjectMemory,
  companyUrlOrOpts?: string | MarketResearchOptions
): Promise<{ title: string; content: string; metadata: MarketResearchMetadata }> {
  // Backwards-compatible: accept old (companyPrompt, memory, companyUrl?) signature
  const opts: MarketResearchOptions =
    typeof companyUrlOrOpts === "string"
      ? { mode: "deep", companyUrl: companyUrlOrOpts }
      : companyUrlOrOpts ?? {};
  const mode = opts.mode ?? "deep";
  const companyUrl = opts.companyUrl;

  const companyName = typeof memory.companyName === "string" && memory.companyName.trim()
    ? memory.companyName.trim()
    : undefined;
  const tagline = typeof memory.tagline === "string" && memory.tagline.trim()
    ? memory.tagline.trim()
    : undefined;
  const identityGuard = companyName
    ? `Use the exact company name "${companyName}" whenever you refer to this startup. Do not invent or substitute a different brand name.`
    : "Refer to the startup generically if no exact company name is provided.";

  // ── Search phase (AI-generated queries for both modes) ──
  const searchQueries = await generateSmartQueries(companyPrompt, companyName, tagline);
  const maxResultsPerQuery = mode === "onboarding" ? 3 : 5;

  const searchResponses = await searchWebMulti(searchQueries, {
    engine: getSearchEngine("market_research"),
    depth: mode === "onboarding" ? "basic" : "advanced",
    maxResultsPerQuery,
  });
  const webContext = formatSearchContext(searchResponses);

  // Exa findSimilar for competitor discovery (run if URL provided, or auto-discover for onboarding)
  let similarContext = "";
  if (companyUrl) {
    const ownDomain = companyUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    const maxResults = mode === "onboarding" ? 5 : 8;
    const similar = await findSimilar(companyUrl, {
      maxResults,
      excludeDomains: ownDomain ? [ownDomain] : undefined,
      textMaxChars: mode === "onboarding" ? 400 : 800,
    });
    similarContext = formatFindSimilarContext(similar);
  }

  const userContext = `${companyName ? `Company name: ${companyName}\n` : ""}${tagline ? `Tagline: ${tagline}\n` : ""}Company idea: ${companyPrompt}
${memory.mission ? `Mission: ${memory.mission}` : ""}
${memory.targetAudience ? `Target audience: ${memory.targetAudience}` : ""}`;

  // ── Onboarding: single combined LLM call (Sonnet, fast) ──
  if (mode === "onboarding") {
    return generateOnboardingResearch(userContext, webContext, similarContext, identityGuard);
  }

  // ── Deep: two-pass with Opus ──
  return generateDeepResearch(userContext, webContext, similarContext, identityGuard, companyName, tagline, companyPrompt, memory);
}

// ── Fast onboarding research (single Sonnet call) ──

async function generateOnboardingResearch(
  userContext: string,
  webContext: string,
  similarContext: string,
  identityGuard: string,
): Promise<{ title: string; content: string; metadata: MarketResearchMetadata }> {
  // ── Pass 1: Raw analysis (Sonnet) ──
  const pass1Prompt = `You are a market research analyst. Write a concise but useful competitive intelligence report for a startup founder.

${identityGuard}
${webContext ? `\nLive web research:\n${webContext}\n` : ""}${similarContext ? `\nSimilar companies (AI discovery — high-confidence competitors):\n${similarContext}\n` : ""}

Your response must be valid JSON with two keys:
- "metadata": { "competitors": [{name, description, strengths, weaknesses}] (3-5), "gaps": [string] (3-5), "targetMarketSize": string, "keyTrends": [string] (3-5) }
- "report": a markdown string with these sections:
  # Market Research Report: <topic>
  ## Executive Summary (2-3 sentences)
  ## Key Metrics Snapshot (markdown table: Metric | Value | Context)
  ## Competitive Landscape (markdown table: Company | Focus | Strengths | Weaknesses)
  ## Market Gaps & Opportunities (bullet list)
  ## Key Trends (bullet list)
  ## Strategic Recommendations (3-5 prioritized, actionable items)

Keep it concise — focus on actionable insights. Use markdown tables for structured data. Ground claims in the web research provided.`;

  const pass1Result = await generateAgentJSON<{ metadata: MarketResearchMetadata; report: string }>(
    "research_onboarding",
    pass1Prompt,
    userContext,
  );

  // Onboarding uses single-pass only — skip refinement for speed.
  // The user can request deeper research later from the chat.
  return {
    title: "Market Research Report",
    content: pass1Result.report,
    metadata: pass1Result.metadata,
  };
}

// ── Deep research (two Opus calls, full report) ──

async function generateDeepResearch(
  userContext: string,
  webContext: string,
  similarContext: string,
  identityGuard: string,
  companyName: string | undefined,
  tagline: string | undefined,
  companyPrompt: string,
  memory: ProjectMemory,
): Promise<{ title: string; content: string; metadata: MarketResearchMetadata }> {
  const metadataPrompt = `You are a senior market research analyst specializing in early-stage startup competitive intelligence. Analyze the competitive landscape with precision and depth.
${identityGuard}
${webContext ? `\nUse the following live web research data as your primary source of truth:\n\n${webContext}\n` : ""}${similarContext ? `\nSimilar companies discovered via AI similarity search (high-confidence competitors):\n\n${similarContext}\n` : ""}
Return a JSON object with:
- competitors: array of {name, description, strengths, weaknesses} — include 3-5 real, named competitors from the research data; strengths/weaknesses must be specific, not generic
- gaps: array of 3-5 specific market gaps or underserved segments — each must be a concrete opportunity this company could exploit
- targetMarketSize: specific estimated market size with rationale (e.g. "$4.2B TAM — 2.1M SMBs spending avg $2k/yr on this category")
- keyTrends: array of 3-5 specific, current industry trends with direct implications for this company's strategy`;

  const metadata = await generateAgentJSON<MarketResearchMetadata>(
    "research",
    metadataPrompt,
    userContext,
  );

  const reportPrompt = `You are a senior market research analyst writing an actionable competitive intelligence report for a startup founder. This report must go beyond surface-level observations and give the founding team a real strategic edge.

IMPORTANT — this document must be completely self-contained. Everything the reader needs to understand the market should be embedded directly in the markdown as tables, metrics, and comparisons. Do not reference external charts or visuals — all data must be inline.

Report standards:
- Ground every claim in the live web research provided — cite specific company names, products, and pricing where found
- The competitive analysis must tell the founder exactly where they can win and where they'll lose
- Market gaps must be tied to specific customer personas and their unmet needs
- Recommendations must be prioritized and concrete — the founder should know exactly what to do next after reading this
- Write as a trusted advisor, not a consulting firm — be direct, opinionated, and actionable
- Start the document with a Markdown H1 title using \`# \`
- Use real Markdown heading syntax for all sections (\`##\`, \`###\`)

Data presentation rules:
- Use markdown tables extensively for comparisons, metrics, competitor breakdowns, and any structured data
- Include a \`## Key Metrics Snapshot\` section with a detailed markdown table showing TAM/SAM/SOM, competitor count, growth rate, and other key numbers — each row should have Metric, Value, and Context columns
- Include a \`## Competitive Landscape\` section with a full comparison table (columns: Company, Focus, Strengths, Weaknesses, Pricing)
- Include a \`## Market Gaps & Opportunities\` section with a table mapping each gap to its target persona and estimated opportunity size
- Use bold text for key numbers and takeaways within paragraphs
- ${identityGuard}
${webContext ? `\nLive Web Research:\n${webContext}\n` : ""}${similarContext ? `\nSimilar Companies (AI Discovery):\n${similarContext}\n` : ""}

Structured research data:
Competitors: ${JSON.stringify(metadata.competitors)}
Market Gaps: ${JSON.stringify(metadata.gaps)}
Market Size: ${metadata.targetMarketSize}
Key Trends: ${JSON.stringify(metadata.keyTrends)}

Document structure (use these exact Markdown headers):
1. \`# Market Research Report: <specific market/topic>\`
2. \`## Executive Summary\`
3. \`## Key Metrics Snapshot\`
4. \`## Market Overview\`
5. \`## Competitive Landscape\`
6. \`## Market Gaps & Opportunities\`
7. \`## Ideal Customer Profile\`
8. \`## Key Trends\`
9. \`## Risks & Challenges\`
10. \`## Strategic Recommendations\`

Write with depth and precision. Use concise paragraphs, bullets, and tables so the founder can skim quickly without losing the important details.`;

  const content = await generateAgentCompletion(
    "research",
    reportPrompt,
    `${companyName ? `Company name: ${companyName}\n` : ""}${tagline ? `Tagline: ${tagline}\n` : ""}Company idea: ${companyPrompt}`,
    {
      maxTokens: 6500,
    }
  );

  return {
    title: "Market Research Report",
    content,
    metadata,
  };
}

// ── AI-powered query generation for deep mode ──

async function generateSmartQueries(
  companyPrompt: string,
  companyName?: string,
  tagline?: string,
): Promise<string[]> {
  try {
    const context = [
      companyName ? `Company: ${companyName}` : "",
      tagline ? `Tagline: ${tagline}` : "",
      `Idea: ${companyPrompt.slice(0, 300)}`,
    ].filter(Boolean).join("\n");

    const result = await generateAgentJSON<{ queries: string[] }>(
      "intent_classification", // fast GPT-4o-mini model for speed
      `You are a search query strategist. Generate 4-5 highly targeted web search queries for deep market research on this startup. Each query should target a DIFFERENT aspect:
1. Direct competitors and alternatives (use specific industry terms)
2. Market size, TAM/SAM data (use "market size" + industry-specific terms)
3. Industry trends and growth signals (append "2025 2026" for recency)
4. Customer pain points and demand signals (use Reddit/forum language)
5. Funding and investment landscape (optional, if relevant)

Rules:
- Each query should be 5-12 words — specific enough to get relevant results
- Use industry-specific terminology, not the raw company description
- Include year filters (2025, 2026) for recency
- Avoid generic queries — "SaaS competitors" is bad, "AI-powered inventory management software competitors 2025" is good

Return JSON: { "queries": ["query1", "query2", "query3", "query4"] }`,
      context,
      { maxTokens: 300 },
    );

    if (result.queries?.length >= 3) {
      return result.queries.slice(0, 5);
    }
  } catch {
    // Fallback to static queries if AI generation fails
  }

  // Fallback: use the static builder
  return buildMarketResearchQueries(companyPrompt);
}

