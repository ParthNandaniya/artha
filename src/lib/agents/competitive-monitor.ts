import { createHash } from "node:crypto";
import type { AgentInput, AgentOutput } from "./types";
import { runAgentic } from "./framework/agentic-runner";
import { validateOutput } from "./framework/validation";
import { getAgenticConfigForSource } from "@/config/agent-agentic-config";
import { getAgentModelConfig } from "@/config/agent-models";
import { summarizeContentForMemory } from "@/lib/personalization";

export async function runCompetitiveMonitorAgent(input: AgentInput): Promise<AgentOutput> {
  const progress = input.onProgress || (() => {});
  const source = (input.metadata?.executionSource as "pipeline" | "chat") || "chat";
  const config = getAgenticConfigForSource("competitive_monitor", source);
  const modelConfig = getAgentModelConfig("competitive_monitor");

  try {
    progress("Starting competitive intelligence analysis...");

    const systemPrompt = `You are a competitive intelligence analyst for an early-stage startup. You have access to web search, URL extraction, and memory tools — use them proactively.

Your workflow:
1. FIRST, use web_search 2-3 times with targeted queries to research competitors mentioned in the request (their websites, pricing pages, product updates, news)
2. Use extract_url to read competitor pages in detail — pricing pages, feature pages, blog posts, changelogs
3. Use query_memory to check what we already know about our own positioning and prior competitive analysis
4. Compare competitor positioning, pricing, and features against the company's own strategy
5. Synthesize findings into a comprehensive competitive intelligence report

CRITICAL RULES:
- Only report on real competitors and real data found via your web searches. NEVER fabricate competitor info.
- Be specific: include actual pricing tiers, feature names, positioning language, and recent changes
- Flag significant changes (new features, pricing changes, pivots, funding rounds) as alerts
- For each alert, suggest a concrete strategic response the company should consider
- Compare directly against the company's own positioning when context is available

Data presentation rules (CRITICAL — follow these exactly):
- This document must be completely self-contained. All data, metrics, and comparisons must be embedded directly in the markdown.
- Use markdown tables extensively for comparisons, metrics, breakdowns, and any structured data
- Include a \`## Key Metrics Snapshot\` section with a detailed markdown table (columns: Metric, Value, Context)
- Use bold text for key numbers and takeaways within paragraphs
- Do NOT reference external charts or visuals — all data must be inline as tables and formatted text
- When comparing items (competitors, channels, personas, etc.), always use a markdown table, never just a list
- Include a full competitor comparison table (Company, Positioning, Key Features, Pricing, Recent Changes)
- Include a feature matrix table and a threat assessment table

Your final output MUST be JSON with:
- title: specific report title (e.g. "Competitive Intel: 5 Emerging Threats in the AI Writing Space")
- content: full Markdown report with sections: Executive Summary, Key Metrics Snapshot, Competitor Profiles, Feature & Pricing Comparison, Change Alerts, Strategic Recommendations
- keyFindings: 3-5 actionable competitive insights
- alerts: array of { competitor, change, severity, suggestedResponse } for significant changes detected
- summary: one-line summary of results

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

    // Convert alerts into tasksCreated for strategic responses
    if (result.success && result.documents?.length) {
      const doc = result.documents[0];
      const title = doc.title || "Competitive intelligence report";
      const content = doc.content || result.summary;
      const keyFindings = (doc.metadata?.keyFindings as string[]) || [];
      const alerts = (doc.metadata?.alerts as Array<{ competitor: string; change: string; severity: string; suggestedResponse: string }>) || [];

      // Create tasks from high-severity alerts
      if (alerts.length > 0) {
        result.tasksCreated = alerts
          .filter((a) => a.severity === "high" || a.severity === "medium")
          .map((alert) => ({
            title: `Respond to ${alert.competitor}: ${alert.change}`,
            description: alert.suggestedResponse,
            type: "competitive_response",
            tag: "research",
            agent: "competitive_monitor",
            revenue_impact: alert.severity === "high" ? "high" : "medium",
          }));
      }

      result.supermemoryIngestions = [{
        content: buildCompetitiveMonitorMemorySummary(title, content, keyFindings, alerts),
        customId: `competitive_monitor_${input.projectId}_${stableHash(input.prompt)}`,
        dedupeKey: `competitive_monitor:${input.projectId}:${stableHash(input.prompt)}`,
        metadata: { type: "competitive_monitor" },
      }];
      result.links = [{ label: "View competitive analysis", url: "#research" }];

      // Write to scratchpad for downstream agents
      if (input.scratchpad && keyFindings.length > 0) {
        input.scratchpad.write("competitive_monitor.keyFindings", keyFindings);
        input.scratchpad.write("competitive_monitor.alertCount", alerts.length);
      }
    }

    return result;
  } catch (error) {
    return {
      success: false,
      agent: "competitive_monitor",
      summary: "Competitive analysis failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function stableHash(prompt: string): string {
  return createHash("sha256").update(prompt.trim().toLowerCase()).digest("hex").slice(0, 12);
}

function buildCompetitiveMonitorMemorySummary(
  title: string,
  content: string,
  keyFindings: string[],
  alerts: Array<{ competitor: string; change: string; severity: string }>,
): string {
  const alertSummary = alerts
    .slice(0, 5)
    .map((a) => `${a.competitor}: ${a.change} (${a.severity})`)
    .join(" | ");

  return [
    `Competitive intelligence: ${title}`,
    keyFindings.length ? `Key Findings: ${keyFindings.slice(0, 5).join(" | ")}` : "",
    alertSummary ? `Alerts: ${alertSummary}` : "",
    `Summary: ${summarizeContentForMemory(content, 700)}`,
  ].filter(Boolean).join("\n");
}
