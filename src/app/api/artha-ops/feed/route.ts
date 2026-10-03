import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";

/**
 * GET /api/artha-ops/feed — Public feed of ops agent activity
 *
 * Shows what Artha's AI agents are doing in real-time.
 * No auth required — this is the public showcase.
 */

export async function GET(request: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "30", 10), 100);
  const agent = searchParams.get("agent");

  const runs = agent
    ? await db`
        SELECT id, agent_name, trigger, status, tokens_used, cost_usd, duration_ms,
               output->>'summary' AS summary,
               COALESCE(jsonb_array_length(actions_taken), 0) AS action_count,
               created_at, completed_at
        FROM artha_ops_runs
        WHERE agent_name = ${agent}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
    : await db`
        SELECT id, agent_name, trigger, status, tokens_used, cost_usd, duration_ms,
               output->>'summary' AS summary,
               COALESCE(jsonb_array_length(actions_taken), 0) AS action_count,
               created_at, completed_at
        FROM artha_ops_runs
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

  // Aggregate stats
  const stats = await db`
    SELECT
      COUNT(*)::int AS total_runs,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
      COALESCE(SUM(cost_usd), 0)::numeric AS total_cost,
      COALESCE(SUM(tokens_used), 0)::int AS total_tokens,
      COUNT(DISTINCT agent_name)::int AS active_agents
    FROM artha_ops_runs
    WHERE created_at >= CURRENT_DATE
  `;

  return NextResponse.json({
    runs,
    todayStats: stats[0] || {},
  });
}
