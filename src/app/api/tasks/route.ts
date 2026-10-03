import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { CreateTaskSchema, parseBody } from "@/lib/validation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tasks = await db`SELECT * FROM tasks WHERE project_id = ${projectId} ORDER BY created_at DESC`;
  return NextResponse.json(tasks);
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json();
  const parsed = parseBody(CreateTaskSchema, raw);
  if (!parsed.success) return parsed.response;
  const { projectId, title, description, isRecurring, recurrenceInterval } = parsed.data;

  const db = getDb();
  const projects = await db`
    SELECT id
    FROM projects WHERE id = ${projectId} AND user_id = ${user.id}
  `;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const maxPriority = await db`
    SELECT COALESCE(MAX(priority), 0) as max_p
    FROM tasks
    WHERE project_id = ${projectId} AND status IN ('queued', 'pending')
  `;
  const nextPriority = (maxPriority[0]?.max_p || 0) + 1;

  const trimmedTitle = title.trim();
  const trimmedDesc = description?.trim() || null;

  const recurring = isRecurring;
  const interval = recurring && recurrenceInterval ? recurrenceInterval : null;
  let nextRunAt: string | null = null;
  if (recurring && interval) {
    const d = new Date();
    switch (interval) {
      case "daily": d.setDate(d.getDate() + 1); break;
      case "weekly": d.setDate(d.getDate() + 7); break;
      case "biweekly": d.setDate(d.getDate() + 14); break;
      case "monthly": d.setMonth(d.getMonth() + 1); break;
    }
    nextRunAt = d.toISOString();
  }

  const rows = await db`
    INSERT INTO tasks (project_id, type, title, description, status, priority, prompt, is_recurring, recurrence_interval, next_run_at, source, tag)
    VALUES (
      ${projectId},
      'custom',
      ${trimmedTitle},
      ${trimmedDesc},
      'queued',
      ${nextPriority},
      ${trimmedDesc || trimmedTitle},
      ${recurring},
      ${interval},
      ${nextRunAt},
      'manual',
      ${null}
    )
    RETURNING *
  `;

  return NextResponse.json(rows[0], { status: 201 });
}
