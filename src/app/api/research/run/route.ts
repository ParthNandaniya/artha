import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { decrementProjectCredits, getProjectCredits } from "@/lib/project-credits";
import { getCreditCost } from "@/config/credit-costs";

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, prompt, tag } = await request.json();
  if (!projectId || !prompt) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const db = getDb();
  const projects = await db`
    SELECT *
    FROM projects WHERE id = ${projectId} AND user_id = ${user.id}
  `;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const project = projects[0] as Record<string, unknown>;
  const creditsAvailable = getProjectCredits(project);
  const cost = getCreditCost("research");

  if (creditsAvailable < cost) {
    return NextResponse.json(
      {
        error: "No task credits remaining",
        action: project.subscription_status === "active"
          ? "wait_or_buy_pack"
          : "subscribe_or_buy_pack",
      },
      { status: 402 }
    );
  }

  await decrementProjectCredits(db, projectId, cost);

  const tasks = await db`
    INSERT INTO tasks (project_id, type, title, description, status, priority, prompt, source)
    VALUES (
      ${projectId},
      'research',
      ${`Research: ${tag?.replace(/_/g, " ") || "general"}`},
      ${prompt},
      'queued',
      1,
      ${prompt},
      'manual'
    )
    RETURNING id
  `;

  const rows = await db`
    INSERT INTO job_queue (type, payload)
    VALUES ('run_task', ${JSON.stringify({
      projectId,
      taskId: tasks[0].id,
      userId: user.id,
      researchType: tag || "research",
      prompt,
      queuedBy: "user",
    })}::jsonb)
    RETURNING id
  `;

  return NextResponse.json({ jobId: rows[0].id, taskId: tasks[0].id });
}
