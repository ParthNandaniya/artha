import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const projects = await db`
    SELECT id
    FROM projects
    WHERE id = ${projectId}
      AND user_id = ${user.id}
    LIMIT 1
  `;
  if (projects.length === 0) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const activeJobs = await db`
    SELECT id, status, error, created_at, started_at, completed_at, payload
    FROM job_queue
    WHERE type = 'run_task'
      AND payload->>'projectId' = ${projectId}
      AND payload->>'userId' = ${user.id}
      AND status IN ('running', 'pending')
    ORDER BY
      CASE WHEN status = 'running' THEN 0 ELSE 1 END,
      created_at ASC,
      id ASC
    LIMIT 1
  `;

  if (activeJobs.length === 0) {
    return NextResponse.json({ job: null });
  }

  const job = activeJobs[0] as {
    id: string;
    status: "pending" | "running";
    error: string | null;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    payload: Record<string, unknown>;
  };

  const taskId = typeof job.payload?.taskId === "string" ? job.payload.taskId : null;
  let taskTitle: string | null = null;
  let taskType: string | null = null;
  let taskStatus: string | null = null;

  if (taskId) {
    try {
      const tasks = await db`
        SELECT id, title, type, status
        FROM tasks
        WHERE id = ${taskId} AND project_id = ${projectId}
        LIMIT 1
      `;
      if (tasks.length > 0) {
        taskTitle = tasks[0].title as string | null;
        taskType = tasks[0].type as string | null;
        taskStatus = tasks[0].status as string | null;
      }
    } catch {
      // If the task lookup fails, return the job metadata we still have.
    }
  }

  return NextResponse.json({
    job: {
      id: job.id,
      status: job.status,
      error: job.error,
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      taskId,
      taskTitle,
      taskType,
      taskStatus,
    },
  });
}
