import type { AgentInput, AgentOutput } from "./types";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";

interface AnalyticsTask {
  title: string;
  description: string;
  type: string;
  tag: string;
  agent: string;
  revenue_impact?: string;
}

interface AnalyticsResponse {
  analysis: string;
  tasks: AnalyticsTask[];
  summary: string;
}

export async function runAnalyticsAgent(input: AgentInput): Promise<AgentOutput> {
  try {
    const progress = input.onProgress || (() => {});

    progress("Analyzing site analytics data...");
    const result = await generateAgentJSON<AnalyticsResponse>(
      "analytics_agent",
      `You are a growth analyst for an early-stage startup. Analyze the provided website analytics data and identify the most impactful improvements. Create specific, actionable tasks that will move the needle on growth.

Analysis principles:
- Focus on the metrics that matter most for early-stage companies: unique visitors, conversion rates, bounce rates, traffic sources, and user engagement
- Identify the highest-leverage opportunities — what one change could have the biggest impact?
- Look for patterns: which pages convert best? where are visitors dropping off? which traffic sources are most valuable?
- Be specific in your analysis — reference actual numbers and trends, not vague observations
- For each improvement task, estimate the potential revenue impact

Return JSON with:
analysis: a concise markdown analysis (3-5 paragraphs) covering key metrics, trends, and opportunities

tasks: array of improvement tasks, each with:
- title: action-oriented title starting with a verb (e.g. "Add testimonials section to landing page")
- description: detailed execution instructions specific enough for an AI agent to act on
- type: one of "landing_page", "content", "outreach", "research", "custom"
- tag: one of "marketing", "seo", "content", "engineering", "analytics"
- agent: one of "website_builder", "research", "email_writer", "task_generator", "twitter"
- revenue_impact: one of "direct", "pipeline", "brand"

summary: one-line summary of the analysis (e.g. "Landing page bounce rate at 72% — 3 high-impact tasks to improve conversion")

Company Context:
${input.context}`,
      input.prompt || "Analyze the site analytics and suggest improvements",
      { maxTokens: 3000 }
    );

    progress("Analytics review complete.");
    const tasks = result.tasks || [];

    const output: AgentOutput = {
      success: true,
      agent: "analytics_agent",
      summary: result.summary || `Analyzed analytics and created ${tasks.length} improvement tasks`,
      documents: [{
        type: "analytics_report",
        title: "Site Analytics Report",
        content: result.analysis || "",
      }],
      tasksCreated: tasks.map((t) => ({
        title: t.title,
        description: t.description,
        type: t.type,
        tag: t.tag,
        agent: t.agent,
        revenue_impact: t.revenue_impact,
      })),
      links: [{ label: "View analysis", url: "#analytics" }],
    };

    if (input.scratchpad) {
      input.scratchpad.write("analytics_agent.taskCount", tasks.length);
      input.scratchpad.write("analytics_agent.summary", result.summary);
    }

    return output;
  } catch (error) {
    return {
      success: false,
      agent: "analytics_agent",
      summary: "Analytics analysis failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
