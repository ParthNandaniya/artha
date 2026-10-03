import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import { sendCreditsExhaustedEmail, isTestEmailBlocked } from "@/lib/postmark";
import { getProjectCredits, decrementProjectCredits } from "@/lib/project-credits";
import { getCreditCost, GENERATE_TASK_COST } from "@/config/credit-costs";
import type { AgentName } from "@/lib/types";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getDb();

    const allProjects = await db`
      SELECT p.*, u.email AS user_email
      FROM projects p
      JOIN users u ON u.id = p.user_id
      WHERE (p.is_demo IS NULL OR p.is_demo = FALSE)
        AND COALESCE(p.hidden, false) = false
        AND COALESCE(u.hidden, false) = false
    `;
    const projects = allProjects.filter((project) =>
      getProjectCredits(project as Record<string, unknown>) > 0
      && !isTestEmailBlocked(project.user_email as string, project.slug as string)
    );

    let executed = 0;

    for (const project of projects) {
      const projectId = project.id as string;
      const creditsAvailable = getProjectCredits(project as Record<string, unknown>);

      const tasks = await db`
        SELECT id, agent FROM tasks
        WHERE project_id = ${projectId} AND status = 'queued'
        ORDER BY priority ASC
        LIMIT 1
      `;

      if (tasks.length === 0) {
        // Need enough credits for task generation + at least the minimum task execution
        if (creditsAvailable < GENERATE_TASK_COST) continue;

        await db`
          INSERT INTO job_queue (type, payload)
          VALUES ('generate_tasks', ${JSON.stringify({
            projectId: project.id,
            count: 5,
            thenExecuteTop: true,
            queuedBy: "cron",
          })}::jsonb)
        `;
        // Deduct generation cost upfront; task execution cost is deducted in generate-tasks processor
        await decrementProjectCredits(db, projectId, GENERATE_TASK_COST);
        executed++;
        continue;
      }

      // Check if project has enough credits for this specific task
      const cost = getCreditCost(tasks[0].agent as AgentName | null);
      if (creditsAvailable < cost) continue;

      // Deduct credits upfront before queueing, same as /api/tasks/run
      await decrementProjectCredits(db, projectId, cost);

      await db`
        INSERT INTO job_queue (type, payload)
        VALUES ('run_task', ${JSON.stringify({ projectId: project.id, taskId: tasks[0].id, queuedBy: "cron" })}::jsonb)
      `;
      executed++;
    }

    // Phase 2: Queue recurring tasks that are due
    const recurringTasks = await db`
      SELECT t.id, t.project_id, t.agent, p.slug AS project_slug, u.email AS user_email
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      JOIN users u ON u.id = p.user_id
      WHERE t.is_recurring = TRUE
        AND t.status = 'pending'
        AND t.next_run_at IS NOT NULL
        AND t.next_run_at <= NOW()
        AND (p.is_demo IS NULL OR p.is_demo = FALSE)
        AND COALESCE(p.hidden, false) = false
        AND COALESCE(u.hidden, false) = false
      ORDER BY t.next_run_at ASC
      LIMIT 50
    `;

    for (const rTask of recurringTasks) {
      if (isTestEmailBlocked(rTask.user_email as string, rTask.project_slug as string)) continue;

      const rProjectId = rTask.project_id as string;
      const rProjectRows = await db`SELECT * FROM projects WHERE id = ${rProjectId}`;
      if (rProjectRows.length === 0) continue;
      const rCredits = getProjectCredits(rProjectRows[0] as Record<string, unknown>);
      const rCost = getCreditCost(rTask.agent as AgentName | null);
      if (rCredits < rCost) continue;

      await decrementProjectCredits(db, rProjectId, rCost);
      await db`UPDATE tasks SET status = 'queued' WHERE id = ${rTask.id}`;
      await db`
        INSERT INTO job_queue (type, payload)
        VALUES ('run_task', ${JSON.stringify({ projectId: rProjectId, taskId: rTask.id, queuedBy: "cron" })}::jsonb)
      `;
      executed++;
    }

    // Notify subscribed projects with 0 credits so founders know to top up
    const zeroCreditsProjects = await db`
      SELECT p.*, u.email, u.name AS user_name
      FROM projects p
      JOIN users u ON u.id = p.user_id
      WHERE p.subscription_status = 'active'
        AND (p.is_demo IS NULL OR p.is_demo = FALSE)
        AND COALESCE(p.hidden, false) = false
        AND COALESCE(u.hidden, false) = false
    `;

    let notified = 0;
    for (const project of zeroCreditsProjects) {
      if (getProjectCredits(project as Record<string, unknown>) > 0) continue;
      if (isTestEmailBlocked(project.email as string, project.slug as string)) continue;
      try {
        await sendCreditsExhaustedEmail(
          project.email as string,
          project.user_name as string | null,
          project.name as string,
          project.slug as string
        );
        notified++;
      } catch {
        // Non-fatal — don't block the cron response
      }
    }

    return NextResponse.json({ executed, notified });
  } catch (error) {
    console.error("Nightly tasks cron failed:", error);
    return NextResponse.json(
      { error: "Nightly tasks failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
