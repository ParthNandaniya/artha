import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, action } = await request.json();
  if (!projectId || !action) {
    return NextResponse.json({ error: "Missing projectId or action" }, { status: 400 });
  }

  const db = getDb();

  // Verify project belongs to user
  const projects = await db`
    SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}
  `;
  if (projects.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "add") {
    await db`UPDATE projects SET task_credits = COALESCE(task_credits, 0) + 10 WHERE id = ${projectId}`;
  } else if (action === "remove") {
    await db`UPDATE projects SET task_credits = 0 WHERE id = ${projectId}`;
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const updated = await db`SELECT task_credits FROM projects WHERE id = ${projectId}`;
  return NextResponse.json({ credits: Number(updated[0].task_credits) });
}
