import { getDb } from "@/lib/neon";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { runOpsAgent } from "./runner";
import { getPlatformMetrics } from "./tools/platform-metrics";
import type { OpsAction } from "./types";

interface ProductReport {
  summary: string;
  featureUsage: { feature: string; usage: number; trend: string }[];
  topRequests: { request: string; mentions: number; source: string }[];
  roadmapSuggestions: { title: string; rationale: string; effort: string; impact: string }[];
  insights: string[];
}

async function getFeatureUsage() {
  const db = getDb();

  const [agentUsage, panelUsage, taskTypes] = await Promise.all([
    db`
      SELECT agent, COUNT(*)::int AS count
      FROM tasks
      WHERE completed_at >= NOW() - INTERVAL '7 days' AND agent IS NOT NULL
      GROUP BY agent
      ORDER BY count DESC
    `,
    db`
      SELECT type, COUNT(*)::int AS count
      FROM chat_messages
      WHERE created_at >= NOW() - INTERVAL '7 days' AND role = 'user'
      GROUP BY type
      ORDER BY count DESC
    `,
    db`
      SELECT type, COUNT(*)::int AS count
      FROM tasks
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY type
      ORDER BY count DESC
    `,
  ]);

  return { agentUsage, panelUsage, taskTypes };
}

async function getUserFeedback() {
  const db = getDb();

  // Get support tickets from last week for common themes
  const tickets = await db`
    SELECT subject, messages, status
    FROM support_tickets
    WHERE created_at >= NOW() - INTERVAL '7 days'
    ORDER BY created_at DESC
    LIMIT 30
  `;

  return tickets;
}

export async function runProductAgent(trigger: "cron" | "manual" = "cron") {
  return runOpsAgent("artha_product", trigger, null, async () => {
    const metrics = await getPlatformMetrics();
    const usage = await getFeatureUsage();
    const feedback = await getUserFeedback();
    const actions: OpsAction[] = [];

    const report = await generateAgentJSON<ProductReport>(
      "artha_product",
      `You are a product analyst for Artha (artha.run), an AI company builder SaaS.
Generate a weekly product intelligence report.

Analyze:
1. Feature usage patterns — which agents/features are most/least used
2. User feedback themes — common requests and pain points from support tickets
3. Product opportunities — where to invest next based on data

Return JSON:
- summary: 2-3 sentence executive summary
- featureUsage: [{ feature, usage (count), trend: "growing"|"declining"|"stable" }]
- topRequests: [{ request, mentions (count), source: "support"|"chat"|"behavior" }]
- roadmapSuggestions: [{ title, rationale, effort: "low"|"medium"|"high", impact: "low"|"medium"|"high" }]
- insights: array of 3-5 key observations`,
      `Platform Metrics:
${JSON.stringify(metrics, null, 2)}

Feature Usage (last 7 days):
Agent usage: ${JSON.stringify(usage.agentUsage)}
Chat types: ${JSON.stringify(usage.panelUsage)}
Task types: ${JSON.stringify(usage.taskTypes)}

Support Tickets (last 7 days):
${feedback.map((t: Record<string, unknown>) => `Subject: ${t.subject} | Status: ${t.status}`).join("\n") || "No tickets"}`,
      { maxTokens: 3000 },
    );

    actions.push({
      type: "report",
      payload: { reportType: "product_weekly", report },
      requiresApproval: false,
    });

    return {
      success: true,
      agent: "artha_product" as const,
      summary: report.summary || "Weekly product report generated",
      actions,
      tokensUsed: { input: 5000, output: 2500 },
    };
  });
}
