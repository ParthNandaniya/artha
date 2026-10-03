import { getDb } from "@/lib/neon";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { runOpsAgent } from "./runner";
import { getPlatformMetrics } from "./tools/platform-metrics";
import type { OpsAgentResult } from "./types";

interface AnalyticsReport {
  summary: string;
  kpis: { metric: string; value: number; change_pct: number; trend: string }[];
  anomalies: { metric: string; expected: number; actual: number; severity: string }[];
  insights: string[];
  recommendations: string[];
}

async function getHistoricalMetrics(days: number) {
  const db = getDb();

  const signupsByDay = await db`
    SELECT DATE(created_at) AS day, COUNT(*)::int AS count
    FROM users
    WHERE created_at >= CURRENT_DATE - ${days} * INTERVAL '1 day'
    GROUP BY DATE(created_at)
    ORDER BY day
  `;

  const tasksByDay = await db`
    SELECT DATE(completed_at) AS day, COUNT(*)::int AS count
    FROM tasks
    WHERE status = 'completed' AND completed_at >= CURRENT_DATE - ${days} * INTERVAL '1 day'
    GROUP BY DATE(completed_at)
    ORDER BY day
  `;

  const revenueByDay = await db`
    SELECT DATE(created_at) AS day, COALESCE(SUM(amount_cents), 0)::int AS total
    FROM revenue_transactions
    WHERE type = 'income' AND status = 'completed' AND created_at >= CURRENT_DATE - ${days} * INTERVAL '1 day'
    GROUP BY DATE(created_at)
    ORDER BY day
  `;

  const opsAgentRuns = await db`
    SELECT agent_name, COUNT(*)::int AS runs, SUM(COALESCE(cost_usd, 0))::numeric AS total_cost,
           COUNT(*) FILTER (WHERE status = 'failed')::int AS failures
    FROM artha_ops_runs
    WHERE created_at >= CURRENT_DATE - ${days} * INTERVAL '1 day'
    GROUP BY agent_name
  `;

  return { signupsByDay, tasksByDay, revenueByDay, opsAgentRuns };
}

export async function runAnalyticsBIAgent(mode: "daily" | "weekly" = "daily") {
  const trigger = "cron" as const;
  const days = mode === "weekly" ? 7 : 1;

  return runOpsAgent("artha_analytics", trigger, { mode }, async () => {
    const metrics = await getPlatformMetrics();
    const historical = await getHistoricalMetrics(mode === "weekly" ? 30 : 7);

    const prompt = mode === "weekly"
      ? `Generate a comprehensive weekly business intelligence report for Artha. Include cohort analysis insights, trend identification, and strategic recommendations.`
      : `Generate a concise daily KPI report for Artha. Focus on today's metrics vs 7-day average, flag any anomalies.`;

    const report = await generateAgentJSON<AnalyticsReport>(
      "artha_analytics",
      `You are a business intelligence analyst for Artha, an AI company builder SaaS ($49/mo).
Analyze platform metrics and produce actionable insights.
Return JSON with:
- summary: 1-2 sentence overview
- kpis: array of {metric, value, change_pct, trend: "up"|"down"|"flat"}
- anomalies: array of {metric, expected, actual, severity: "low"|"medium"|"high"} — only if actual deviates >2x from expected
- insights: array of 2-4 key observations
- recommendations: array of 1-3 actionable suggestions`,
      `Current Metrics:
${JSON.stringify(metrics, null, 2)}

Historical Data (${days} days):
Signups by day: ${JSON.stringify(historical.signupsByDay)}
Tasks by day: ${JSON.stringify(historical.tasksByDay)}
Revenue by day: ${JSON.stringify(historical.revenueByDay)}
Ops agent performance: ${JSON.stringify(historical.opsAgentRuns)}

Mode: ${mode} report`,
      { maxTokens: 2000 },
    );

    const actions: { type: string; payload: Record<string, unknown>; requiresApproval: boolean }[] = [
      {
        type: "report",
        payload: { mode, report },
        requiresApproval: false,
      },
    ];

    // Flag high-severity anomalies
    const criticalAnomalies = (report.anomalies || []).filter((a) => a.severity === "high");
    if (criticalAnomalies.length > 0) {
      actions.push({
        type: "alert",
        payload: { anomalies: criticalAnomalies },
        requiresApproval: false,
      });
    }

    return {
      success: true,
      agent: "artha_analytics" as const,
      summary: report.summary || `${mode} analytics report generated`,
      actions,
      tokensUsed: { input: 3000, output: 1500 },
    };
  });
}
