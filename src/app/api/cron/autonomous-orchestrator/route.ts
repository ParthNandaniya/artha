import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { getProjectCredits, decrementProjectCredits } from "@/lib/project-credits";
import { getCreditCost, GENERATE_TASK_COST } from "@/config/credit-costs";
import { getProjectAnalyticsSummary, formatAnalyticsForPrompt } from "@/lib/analytics-context";
import { logAgentActivity } from "@/lib/agent-activity";
import type { AgentName } from "@/lib/types";
import { isTestEmailBlocked } from "@/lib/postmark";

// ── Types ─────────────────────────────────────────────────────────────

interface OrchestratorAction {
  type: "run_task" | "generate_tasks" | "post_content" | "send_outreach" | "run_research" | "skip";
  reason: string;
  priority: number;
  taskId?: string;
  description?: string;
}

interface OrchestratorDecision {
  actions: OrchestratorAction[];
  summary: string;
  nextCheckRecommendation: string;
}

interface ProjectState {
  projectId: string;
  companyName: string;
  slug: string;
  daysSinceCreation: number;
  creditsRemaining: number;
  subscriptionStatus: string;
  recentCompletedTasks: Array<{ id: string; title: string; agent: string | null; completed_at: string }>;
  queuedTasks: Array<{ id: string; title: string; agent: string | null; priority: number }>;
  analytics: string;
  leadCount: number;
  newLeadsLast7d: number;
  lastEmailSentAt: string | null;
  lastSocialPostAt: string | null;
  recentOrchestratorActions: string[];
}

// ── Constants ─────────────────────────────────────────────────────────

const MAX_ACTIONS_PER_PROJECT = 2;
const MIN_HOURS_BETWEEN_RUNS = 4;
/** Credit cost for the orchestrator AI call itself */
const ORCHESTRATOR_DECISION_COST = 0.1;

// ── Main handler ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getDb();

    // 1. Query eligible projects
    const allProjects = await db`
      SELECT p.*, u.email, u.name AS user_name
      FROM projects p
      JOIN users u ON u.id = p.user_id
      WHERE (p.is_demo IS NULL OR p.is_demo = FALSE)
        AND p.status = 'active'
        AND (p.autonomous_mode IS NULL OR p.autonomous_mode = TRUE)
        AND COALESCE(p.hidden, false) = false
        AND COALESCE(u.hidden, false) = false
    `;

    const projects = allProjects.filter(
      (p) => getProjectCredits(p as Record<string, unknown>) > 0
        && !isTestEmailBlocked(p.email as string, p.slug as string)
    );

    let processed = 0;
    let skipped = 0;
    let actionsQueued = 0;
    const errors: string[] = [];

    for (const project of projects) {
      const projectId = project.id as string;
      const companyName = (project.name as string) || "Unknown";

      try {
        // 2. Check cooldown — skip if last orchestrator run was < MIN_HOURS_BETWEEN_RUNS ago
        const recentRuns = await db`
          SELECT created_at FROM agent_activity
          WHERE project_id = ${projectId}
            AND agent_type = 'orchestrator'
            AND action = 'decided'
          ORDER BY created_at DESC
          LIMIT 1
        `;

        if (recentRuns.length > 0) {
          const lastRun = new Date(recentRuns[0].created_at as string);
          const hoursSince = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60);
          if (hoursSince < MIN_HOURS_BETWEEN_RUNS) {
            skipped++;
            continue;
          }
        }

        // 3. Check credits for the orchestrator decision call itself
        const credits = getProjectCredits(project as Record<string, unknown>);
        if (credits < ORCHESTRATOR_DECISION_COST) {
          skipped++;
          continue;
        }

        // 4. Gather project state
        const state = await gatherProjectState(db, project);

        // 5. Deduct cost for the AI decision call
        await decrementProjectCredits(db, projectId, ORCHESTRATOR_DECISION_COST);

        // 6. Ask AI for decisions
        const decision = await getOrchestratorDecision(state);

        // 7. Log the decision
        await logAgentActivity({
          projectId,
          agentType: "orchestrator",
          action: "decided",
          title: `Orchestrator reviewed ${companyName}`,
          description: decision.summary,
          metadata: {
            actions: decision.actions,
            nextCheckRecommendation: decision.nextCheckRecommendation,
            creditsAtDecision: credits,
          },
        });

        // 8. Execute top actions (max MAX_ACTIONS_PER_PROJECT)
        const actionable = decision.actions
          .filter((a) => a.type !== "skip")
          .sort((a, b) => a.priority - b.priority)
          .slice(0, MAX_ACTIONS_PER_PROJECT);

        if (actionable.length === 0) {
          await logAgentActivity({
            projectId,
            agentType: "orchestrator",
            action: "skipped",
            title: `No actions needed for ${companyName}`,
            description: decision.summary,
          });
          processed++;
          continue;
        }

        // Re-check credits before queuing actions
        const freshProject = await db`SELECT * FROM projects WHERE id = ${projectId}`;
        if (freshProject.length === 0) continue;
        let remainingCredits = getProjectCredits(freshProject[0] as Record<string, unknown>);

        for (const action of actionable) {
          const cost = getActionCost(action);
          if (remainingCredits < cost) {
            await logAgentActivity({
              projectId,
              agentType: "orchestrator",
              action: "skipped",
              title: `Skipped ${action.type}: insufficient credits`,
              description: `Need ${cost} credits, have ${remainingCredits}. Reason: ${action.reason}`,
            });
            continue;
          }

          await queueAction(db, projectId, action);
          await decrementProjectCredits(db, projectId, cost);
          remainingCredits -= cost;
          actionsQueued++;

          await logAgentActivity({
            projectId,
            agentType: "orchestrator",
            action: "executed",
            title: `Queued ${action.type} for ${companyName}`,
            description: action.reason,
            metadata: { actionType: action.type, taskId: action.taskId, creditCost: cost },
          });
        }

        processed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${companyName} (${projectId}): ${msg}`);

        await logAgentActivity({
          projectId,
          agentType: "orchestrator",
          action: "failed",
          title: `Orchestrator failed for ${companyName}`,
          description: msg,
        }).catch(() => {});
      }
    }

    return NextResponse.json({
      processed,
      skipped,
      actionsQueued,
      totalProjects: projects.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Autonomous orchestrator cron failed:", error);
    return NextResponse.json(
      { error: "Orchestrator failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// ── State gathering ───────────────────────────────────────────────────

async function gatherProjectState(
  db: ReturnType<typeof getDb>,
  project: Record<string, unknown>
): Promise<ProjectState> {
  const projectId = project.id as string;
  const companyName = (project.name as string) || "Unknown";
  const slug = (project.slug as string) || "";
  const createdAt = new Date(project.created_at as string);
  const daysSinceCreation = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

  const [
    recentCompleted,
    queuedTasks,
    leadStats,
    lastEmail,
    lastSocialPost,
    recentActivity,
  ] = await Promise.all([
    // Recent completed tasks (last 48h)
    db`
      SELECT id, title, agent, completed_at
      FROM tasks
      WHERE project_id = ${projectId}
        AND status = 'completed'
        AND completed_at >= NOW() - INTERVAL '48 hours'
      ORDER BY completed_at DESC
      LIMIT 10
    `,
    // Queued tasks
    db`
      SELECT id, title, agent, priority
      FROM tasks
      WHERE project_id = ${projectId} AND status = 'queued'
      ORDER BY priority ASC
      LIMIT 5
    `,
    // Lead count
    db`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS new_7d
      FROM leads
      WHERE project_id = ${projectId}
    `,
    // Last email sent
    db`
      SELECT sent_at FROM email_sends
      WHERE project_id = ${projectId}
      ORDER BY sent_at DESC
      LIMIT 1
    `,
    // Last social post (from content_calendar)
    db`
      SELECT published_at FROM content_calendar
      WHERE project_id = ${projectId} AND status = 'published'
      ORDER BY published_at DESC
      LIMIT 1
    `,
    // Recent orchestrator actions (to avoid repeats)
    db`
      SELECT title FROM agent_activity
      WHERE project_id = ${projectId}
        AND agent_type = 'orchestrator'
        AND created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
      LIMIT 5
    `,
  ]);

  // Analytics (non-fatal if it fails)
  let analyticsText = "Analytics unavailable.";
  try {
    const analytics = await getProjectAnalyticsSummary(projectId);
    analyticsText = formatAnalyticsForPrompt(analytics, companyName);
  } catch {
    // Non-fatal
  }

  return {
    projectId,
    companyName,
    slug,
    daysSinceCreation,
    creditsRemaining: getProjectCredits(project as Record<string, unknown>),
    subscriptionStatus: (project.subscription_status as string) || "none",
    recentCompletedTasks: recentCompleted.map((t) => ({
      id: t.id as string,
      title: t.title as string,
      agent: t.agent as string | null,
      completed_at: t.completed_at as string,
    })),
    queuedTasks: queuedTasks.map((t) => ({
      id: t.id as string,
      title: t.title as string,
      agent: t.agent as string | null,
      priority: t.priority as number,
    })),
    analytics: analyticsText,
    leadCount: parseInt((leadStats[0]?.total as string) || "0", 10),
    newLeadsLast7d: parseInt((leadStats[0]?.new_7d as string) || "0", 10),
    lastEmailSentAt: lastEmail.length > 0 ? (lastEmail[0].sent_at as string) : null,
    lastSocialPostAt: lastSocialPost.length > 0 ? (lastSocialPost[0].published_at as string) : null,
    recentOrchestratorActions: recentActivity.map((a) => a.title as string),
  };
}

// ── AI Decision ───────────────────────────────────────────────────────

async function getOrchestratorDecision(state: ProjectState): Promise<OrchestratorDecision> {
  const systemPrompt = `You are the autonomous CEO agent for "${state.companyName}". Your job is to review the company state and decide the top 1-2 highest-impact actions to take right now.

Rules:
- If there are queued tasks, prioritize running those first (type: "run_task" with the taskId).
- If the queue is empty and the company needs work, generate new tasks (type: "generate_tasks").
- If the company is in good shape and nothing urgent is needed, use type: "skip".
- Maximum 2 actions per decision.
- Consider: Is the website getting traffic? Are leads being found? Is content being posted regularly? What's the biggest gap?
- For very new companies (<3 days old), focus on foundational tasks (research, content).
- For established companies, focus on growth (outreach, content posting, lead generation).
- Don't repeat actions that were recently taken (check recentOrchestratorActions).

Return JSON matching this schema:
{
  "actions": [
    {
      "type": "run_task" | "generate_tasks" | "post_content" | "send_outreach" | "run_research" | "skip",
      "reason": "string explaining why",
      "priority": 1,
      "taskId": "uuid (only for run_task)",
      "description": "what to do (for generate_tasks)"
    }
  ],
  "summary": "1-2 sentence human-readable summary",
  "nextCheckRecommendation": "in 6 hours | in 12 hours | tomorrow"
}`;

  const userPrompt = `Company: ${state.companyName} (${state.slug})
Days since creation: ${state.daysSinceCreation}
Credits remaining: ${state.creditsRemaining}
Subscription: ${state.subscriptionStatus}

== Recent Completed Tasks (48h) ==
${state.recentCompletedTasks.length > 0
    ? state.recentCompletedTasks.map((t) => `- ${t.title} (${t.agent || "unknown"}, completed ${t.completed_at})`).join("\n")
    : "None"}

== Queued Tasks ==
${state.queuedTasks.length > 0
    ? state.queuedTasks.map((t) => `- [${t.id}] ${t.title} (${t.agent || "unknown"}, priority ${t.priority})`).join("\n")
    : "None — queue is empty"}

== Analytics ==
${state.analytics}

== Leads ==
Total: ${state.leadCount}, New in last 7 days: ${state.newLeadsLast7d}

== Last Email Sent ==
${state.lastEmailSentAt || "Never"}

== Last Social Post ==
${state.lastSocialPostAt || "Never"}

== Recent Orchestrator Actions (24h) ==
${state.recentOrchestratorActions.length > 0 ? state.recentOrchestratorActions.join("\n") : "None"}

What should we do right now?`;

  const decision = await generateAgentJSON<OrchestratorDecision>(
    "autonomous_orchestrator",
    systemPrompt,
    userPrompt,
    { temperature: 0.3 }
  );

  // Validate and sanitize the response
  if (!decision.actions || !Array.isArray(decision.actions)) {
    return {
      actions: [{ type: "skip", reason: "Invalid AI response — no actions returned", priority: 1 }],
      summary: "Orchestrator returned invalid response, skipping.",
      nextCheckRecommendation: "in 6 hours",
    };
  }

  return decision;
}

// ── Action queueing ───────────────────────────────────────────────────

function getActionCost(action: OrchestratorAction): number {
  switch (action.type) {
    case "run_task": {
      // Use default cost since we don't know the agent type at this point;
      // the exact cost will be reconciled when the worker picks it up.
      return 1;
    }
    case "generate_tasks":
      return GENERATE_TASK_COST;
    case "post_content":
      return getCreditCost("social_media_manager" as AgentName);
    case "send_outreach":
      return getCreditCost("email_writer" as AgentName);
    case "run_research":
      return getCreditCost("research" as AgentName);
    case "skip":
      return 0;
    default:
      return 1;
  }
}

async function queueAction(
  db: ReturnType<typeof getDb>,
  projectId: string,
  action: OrchestratorAction
) {
  switch (action.type) {
    case "run_task": {
      if (!action.taskId) return;
      await db`
        INSERT INTO job_queue (type, payload)
        VALUES ('run_task', ${JSON.stringify({
          projectId,
          taskId: action.taskId,
          queuedBy: "orchestrator",
        })}::jsonb)
      `;
      break;
    }
    case "generate_tasks": {
      await db`
        INSERT INTO job_queue (type, payload)
        VALUES ('generate_tasks', ${JSON.stringify({
          projectId,
          count: 5,
          thenExecuteTop: true,
          queuedBy: "orchestrator",
        })}::jsonb)
      `;
      break;
    }
    case "post_content": {
      await db`
        INSERT INTO job_queue (type, payload)
        VALUES ('post_content', ${JSON.stringify({
          projectId,
          queuedBy: "orchestrator",
          reason: action.reason,
        })}::jsonb)
      `;
      break;
    }
    case "send_outreach": {
      await db`
        INSERT INTO job_queue (type, payload)
        VALUES ('send_outreach', ${JSON.stringify({
          projectId,
          queuedBy: "orchestrator",
          reason: action.reason,
        })}::jsonb)
      `;
      break;
    }
    case "run_research": {
      await db`
        INSERT INTO job_queue (type, payload)
        VALUES ('run_research', ${JSON.stringify({
          projectId,
          queuedBy: "orchestrator",
          reason: action.reason,
        })}::jsonb)
      `;
      break;
    }
    case "skip":
      // No-op
      break;
  }
}
