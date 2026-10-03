import type { Metadata } from "next";
import { getDb } from "@/lib/neon";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Artha Ops — Watch AI Run a Business 24/7",
  description:
    "Artha runs itself with 7 AI agents: growth, support, sales, analytics, ops, product, and community. See it live.",
  openGraph: {
    title: "Artha Ops — Watch AI Run a Business 24/7",
    description:
      "Artha runs itself with 7 AI agents: growth, support, sales, analytics, ops, product, and community. See it live.",
  },
};

const AGENT_INFO: Record<string, { label: string; emoji: string; description: string; frequency: string }> = {
  artha_ops: { label: "Ops", emoji: "🔧", description: "Health monitoring & auto-healing", frequency: "Every 15min" },
  artha_analytics: { label: "Analytics", emoji: "📊", description: "Daily KPIs & anomaly detection", frequency: "Daily + Weekly" },
  artha_support: { label: "Support", emoji: "💬", description: "Ticket triage & auto-response", frequency: "Every 30min" },
  artha_growth: { label: "Growth", emoji: "📈", description: "Content creation & marketing", frequency: "Every 4h" },
  artha_community: { label: "Community", emoji: "🎉", description: "Milestones & engagement", frequency: "Every 1h" },
  artha_sales: { label: "Sales", emoji: "💰", description: "Conversion & win-back", frequency: "Every 2h" },
  artha_product: { label: "Product", emoji: "🧭", description: "Feature analysis & roadmap", frequency: "Weekly" },
};

async function getOpsData() {
  const db = getDb();

  const [recentRuns, todayStats, agentStats] = await Promise.all([
    db`
      SELECT id, agent_name, trigger, status, tokens_used, cost_usd, duration_ms,
             output->>'summary' AS summary,
             COALESCE(jsonb_array_length(actions_taken), 0) AS action_count,
             created_at, completed_at
      FROM artha_ops_runs
      ORDER BY created_at DESC
      LIMIT 50
    `,
    db`
      SELECT
        COUNT(*)::int AS total_runs,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COALESCE(SUM(cost_usd)::numeric, 0) AS total_cost,
        COALESCE(SUM(tokens_used)::int, 0) AS total_tokens
      FROM artha_ops_runs
      WHERE created_at >= CURRENT_DATE
    `,
    db`
      SELECT agent_name,
        COUNT(*)::int AS runs,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS successes,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failures,
        COALESCE(SUM(cost_usd)::numeric, 0) AS cost
      FROM artha_ops_runs
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY agent_name
      ORDER BY runs DESC
    `,
  ]);

  return { recentRuns, todayStats: todayStats[0], agentStats };
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(usd: number | null): string {
  if (!usd) return "$0.00";
  return `$${Number(usd).toFixed(4)}`;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function OpsPage() {
  const { recentRuns, todayStats, agentStats } = await getOpsData();

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
            <h1 className="text-2xl font-bold">Artha Ops</h1>
          </div>
          <p className="text-zinc-400 text-sm">
            7 AI agents run Artha&apos;s business 24/7. Everything you see here, you can build for your own company.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        {/* Today's Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Runs Today" value={String(todayStats?.total_runs || 0)} />
          <StatCard label="Completed" value={String(todayStats?.completed || 0)} />
          <StatCard label="Failed" value={String(todayStats?.failed || 0)} />
          <StatCard label="Cost Today" value={formatCost(todayStats?.total_cost as number)} />
        </div>

        {/* Agent Grid */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Active Agents</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Object.entries(AGENT_INFO).map(([name, info]) => {
              const stats = (agentStats as Record<string, unknown>[]).find(
                (s) => s.agent_name === name
              );
              return (
                <div key={name} className="rounded-lg border border-zinc-800 p-4 bg-zinc-900/50">
                  <div className="flex items-center gap-2 mb-1">
                    <span>{info.emoji}</span>
                    <span className="font-medium text-sm">{info.label}</span>
                  </div>
                  <p className="text-xs text-zinc-500 mb-2">{info.description}</p>
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>{info.frequency}</span>
                    <span>
                      {stats
                        ? `${stats.successes}/${stats.runs} ok`
                        : "No runs yet"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          <div className="space-y-2">
            {(recentRuns as Record<string, unknown>[]).map((run) => {
              const agentName = run.agent_name as string;
              const info = AGENT_INFO[agentName] || { label: agentName, emoji: "🤖" };
              const status = run.status as string;

              return (
                <div
                  key={run.id as string}
                  className="flex items-start gap-3 rounded-lg border border-zinc-800/50 px-4 py-3 bg-zinc-900/30"
                >
                  <span className="text-lg mt-0.5">{info.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-sm">{info.label}</span>
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          status === "completed"
                            ? "bg-green-500"
                            : status === "failed"
                              ? "bg-red-500"
                              : "bg-yellow-500 animate-pulse"
                        }`}
                      />
                      <span className="text-xs text-zinc-500">
                        {timeAgo(run.created_at as string)}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 truncate">
                      {(run.summary as string) || "Running..."}
                    </p>
                  </div>
                  <div className="text-right text-xs text-zinc-500 shrink-0">
                    <div>{formatDuration(run.duration_ms as number)}</div>
                    <div>{formatCost(run.cost_usd as number)}</div>
                  </div>
                </div>
              );
            })}
            {recentRuns.length === 0 && (
              <p className="text-zinc-500 text-sm text-center py-8">
                No ops agent runs yet. Agents will start running once cron jobs are configured.
              </p>
            )}
          </div>
        </div>

        {/* CTA */}
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-6 text-center">
          <h3 className="font-semibold mb-2">Build this for your business</h3>
          <p className="text-sm text-zinc-400 mb-4">
            Every agent running this page is built on Artha&apos;s platform.
            Create your own AI-powered company in minutes.
          </p>
          <a
            href="/"
            className="inline-block rounded-lg bg-white text-black px-6 py-2 text-sm font-medium hover:bg-zinc-200 transition-colors"
          >
            Get started
          </a>
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 p-4 bg-zinc-900/50">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
