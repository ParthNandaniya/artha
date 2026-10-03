import { getDb } from "@/lib/neon";

export interface PlatformMetrics {
  totalUsers: number;
  totalProjects: number;
  activeProjects: number;
  subscribedProjects: number;
  totalTasksCompleted: number;
  totalTweetsPosted: number;
  totalLeadsFound: number;
  totalDocuments: number;
  signupsToday: number;
  signupsThisWeek: number;
  tasksCompletedToday: number;
  revenueThisMonth: number;
  churnsThisMonth: number;
  jobQueueHealth: { pending: number; running: number; failed: number };
}

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const db = getDb();

  const [
    users,
    projects,
    activeProjects,
    subscribedProjects,
    tasksCompleted,
    tweets,
    leads,
    documents,
    signupsToday,
    signupsWeek,
    tasksToday,
    revenue,
    churns,
    jobHealth,
  ] = await Promise.all([
    db`SELECT COUNT(*)::int AS count FROM users`,
    db`SELECT COUNT(*)::int AS count FROM projects`,
    db`SELECT COUNT(*)::int AS count FROM projects WHERE status = 'active'`,
    db`SELECT COUNT(*)::int AS count FROM projects WHERE subscription_status = 'active'`,
    db`SELECT COUNT(*)::int AS count FROM tasks WHERE status = 'completed'`,
    db`SELECT COUNT(*)::int AS count FROM tweets WHERE status = 'posted'`,
    db`SELECT COUNT(*)::int AS count FROM leads`,
    db`SELECT COUNT(*)::int AS count FROM documents`,
    db`SELECT COUNT(*)::int AS count FROM users WHERE created_at >= CURRENT_DATE`,
    db`SELECT COUNT(*)::int AS count FROM users WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'`,
    db`SELECT COUNT(*)::int AS count FROM tasks WHERE status = 'completed' AND completed_at >= CURRENT_DATE`,
    db`SELECT COALESCE(SUM(amount_cents), 0)::int AS total FROM revenue_transactions WHERE type = 'income' AND status = 'completed' AND created_at >= DATE_TRUNC('month', CURRENT_DATE)`,
    db`SELECT COUNT(*)::int AS count FROM churn_events WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)`,
    db`SELECT status, COUNT(*)::int AS count FROM job_queue WHERE status IN ('pending', 'running', 'failed') GROUP BY status`,
  ]);

  const jobMap: Record<string, number> = {};
  for (const row of jobHealth) {
    jobMap[row.status as string] = row.count as number;
  }

  return {
    totalUsers: (users[0].count as number) || 0,
    totalProjects: (projects[0].count as number) || 0,
    activeProjects: (activeProjects[0].count as number) || 0,
    subscribedProjects: (subscribedProjects[0].count as number) || 0,
    totalTasksCompleted: (tasksCompleted[0].count as number) || 0,
    totalTweetsPosted: (tweets[0].count as number) || 0,
    totalLeadsFound: (leads[0].count as number) || 0,
    totalDocuments: (documents[0].count as number) || 0,
    signupsToday: (signupsToday[0].count as number) || 0,
    signupsThisWeek: (signupsWeek[0].count as number) || 0,
    tasksCompletedToday: (tasksToday[0].count as number) || 0,
    revenueThisMonth: (revenue[0].total as number) || 0,
    churnsThisMonth: (churns[0].count as number) || 0,
    jobQueueHealth: {
      pending: jobMap.pending || 0,
      running: jobMap.running || 0,
      failed: jobMap.failed || 0,
    },
  };
}

export interface UserSegment {
  segment: string;
  count: number;
  userIds: string[];
}

export async function getUserSegments(): Promise<UserSegment[]> {
  const db = getDb();

  const [freeActive, freeDormant, subscribed, churned] = await Promise.all([
    db`
      SELECT u.id FROM users u
      JOIN projects p ON p.user_id = u.id
      WHERE p.subscription_status = 'none'
        AND p.status = 'active'
        AND p.created_at >= NOW() - INTERVAL '30 days'
    `,
    db`
      SELECT u.id FROM users u
      JOIN projects p ON p.user_id = u.id
      WHERE p.subscription_status = 'none'
        AND p.status = 'active'
        AND p.created_at < NOW() - INTERVAL '30 days'
    `,
    db`
      SELECT u.id FROM users u
      JOIN projects p ON p.user_id = u.id
      WHERE p.subscription_status = 'active'
    `,
    db`
      SELECT u.id FROM users u
      JOIN projects p ON p.user_id = u.id
      WHERE p.subscription_status = 'cancelled'
    `,
  ]);

  return [
    { segment: "free_active", count: freeActive.length, userIds: freeActive.map((r: Record<string, unknown>) => r.id as string) },
    { segment: "free_dormant", count: freeDormant.length, userIds: freeDormant.map((r: Record<string, unknown>) => r.id as string) },
    { segment: "subscribed", count: subscribed.length, userIds: subscribed.map((r: Record<string, unknown>) => r.id as string) },
    { segment: "churned", count: churned.length, userIds: churned.map((r: Record<string, unknown>) => r.id as string) },
  ];
}

export async function getRecentOpsRuns(limit = 20): Promise<Record<string, unknown>[]> {
  const db = getDb();
  const rows = await db`
    SELECT id, agent_name, trigger, status, tokens_used, cost_usd, duration_ms, error,
           created_at, completed_at,
           output->>'summary' AS summary
    FROM artha_ops_runs
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as Record<string, unknown>[];
}
