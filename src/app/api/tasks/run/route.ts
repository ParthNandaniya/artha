import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { decrementProjectCredits, getProjectCredits } from "@/lib/project-credits";
import { getCreditCost } from "@/config/credit-costs";
import type { AgentName } from "@/lib/types";

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId, projectId } = await request.json();
  const db = getDb();

  const projects = await db`
    SELECT *
    FROM projects WHERE id = ${projectId} AND user_id = ${user.id}
  `;
  if (projects.length === 0) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const project = projects[0] as Record<string, unknown>;
  const creditsAvailable = getProjectCredits(project);

  const tasks = await db`SELECT id, agent FROM tasks WHERE id = ${taskId} AND project_id = ${projectId}`;
  if (tasks.length === 0) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const cost = getCreditCost(tasks[0].agent as AgentName | null);

  if (creditsAvailable < cost) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://artha.run";
    return NextResponse.json({
      error: "No task credits remaining",
      message: "You're out of task credits. Buy a credit pack or subscribe to keep running tasks.",
      purchaseUrl: `${appUrl}/dashboard?buy_credits=true`,
    }, { status: 402 });
  }

  // Queue the job first, then deduct credits — avoids losing credits if queue insert fails
  const rows = await db`
    INSERT INTO job_queue (type, payload)
    VALUES (
      'run_task',
      ${JSON.stringify({ projectId, taskId, userId: user.id, queuedBy: "user" })}::jsonb
    )
    RETURNING id
  `;

  await decrementProjectCredits(db, projectId, cost);

  return NextResponse.json({ jobId: rows[0].id });
}
