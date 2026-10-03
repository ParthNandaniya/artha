import { getDb } from "@/lib/neon";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { runOpsAgent } from "./runner";
import { getPlatformMetrics } from "./tools/platform-metrics";
import type { OpsAgentResult } from "./types";

interface HealthCheck {
  workerHealthy: boolean;
  stalledJobs: number;
  failedJobsLastHour: number;
  pendingJobs: number;
  errorRate: number;
  issues: string[];
}

async function checkSystemHealth(): Promise<HealthCheck> {
  const db = getDb();
  const issues: string[] = [];

  // Check for stalled jobs (running > 30 min)
  const stalled = await db`
    SELECT COUNT(*)::int AS count FROM job_queue
    WHERE status = 'running' AND started_at < NOW() - INTERVAL '30 minutes'
  `;
  const stalledCount = (stalled[0].count as number) || 0;
  if (stalledCount > 0) issues.push(`${stalledCount} stalled jobs (running >30min)`);

  // Check failed jobs in last hour
  const failed = await db`
    SELECT COUNT(*)::int AS count FROM job_queue
    WHERE status = 'failed' AND completed_at >= NOW() - INTERVAL '1 hour'
  `;
  const failedCount = (failed[0].count as number) || 0;
  if (failedCount > 3) issues.push(`${failedCount} failed jobs in last hour (high)`);

  // Check pending job backlog
  const pending = await db`
    SELECT COUNT(*)::int AS count FROM job_queue WHERE status = 'pending'
  `;
  const pendingCount = (pending[0].count as number) || 0;
  if (pendingCount > 20) issues.push(`${pendingCount} pending jobs (backlog building)`);

  // Check if worker processed anything recently (last 15 min)
  const recent = await db`
    SELECT COUNT(*)::int AS count FROM job_queue
    WHERE status = 'completed' AND completed_at >= NOW() - INTERVAL '15 minutes'
  `;
  const recentCompleted = (recent[0].count as number) || 0;
  const workerHealthy = pendingCount === 0 || recentCompleted > 0;
  if (!workerHealthy && pendingCount > 0) issues.push("Worker may be stalled — pending jobs but none completed in 15min");

  // Calculate error rate (failed / total in last hour)
  const totalLastHour = await db`
    SELECT COUNT(*)::int AS count FROM job_queue
    WHERE completed_at >= NOW() - INTERVAL '1 hour'
  `;
  const total = (totalLastHour[0].count as number) || 1;
  const errorRate = failedCount / total;
  if (errorRate > 0.2) issues.push(`Error rate ${(errorRate * 100).toFixed(0)}% in last hour`);

  return {
    workerHealthy,
    stalledJobs: stalledCount,
    failedJobsLastHour: failedCount,
    pendingJobs: pendingCount,
    errorRate,
    issues,
  };
}

export async function runOpsHealthAgent(trigger: "cron" | "manual" = "cron") {
  return runOpsAgent("artha_ops", trigger, null, async () => {
    const health = await checkSystemHealth();
    const metrics = await getPlatformMetrics();
    const actions: { type: string; payload: Record<string, unknown>; requiresApproval: boolean }[] = [];

    // Only use AI if there are issues to analyze
    if (health.issues.length > 0) {
      const analysis = await generateAgentJSON<{ summary: string; severity: string; recommendation: string }>(
        "artha_ops",
        `You are a DevOps monitoring agent for Artha, an AI company builder SaaS.
Analyze system health issues and provide a concise assessment.
Return JSON with: summary (1 sentence), severity ("low" | "medium" | "high" | "critical"), recommendation (1-2 sentences).`,
        `Current issues:\n${health.issues.map((i) => `- ${i}`).join("\n")}\n\nMetrics: ${JSON.stringify(metrics.jobQueueHealth)}`,
        { maxTokens: 500 },
      );

      actions.push({
        type: "alert",
        payload: {
          severity: analysis.severity,
          summary: analysis.summary,
          recommendation: analysis.recommendation,
          health,
        },
        requiresApproval: false,
      });

      return {
        success: true,
        agent: "artha_ops" as const,
        summary: `Health check: ${health.issues.length} issues found — ${analysis.severity} severity`,
        actions,
        tokensUsed: { input: 500, output: 200 },
      };
    }

    return {
      success: true,
      agent: "artha_ops" as const,
      summary: `Health check: all systems normal. ${metrics.jobQueueHealth.pending} pending, ${metrics.jobQueueHealth.running} running.`,
      actions,
      tokensUsed: { input: 0, output: 0 },
    };
  });
}
