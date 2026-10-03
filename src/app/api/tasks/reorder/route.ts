import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, taskIds } = await request.json();

  if (!projectId || !Array.isArray(taskIds) || !taskIds.every((taskId) => typeof taskId === "string")) {
    return NextResponse.json({ error: "Missing projectId or taskIds" }, { status: 400 });
  }

  const db = getDb();
  const projects = await db`
    SELECT id
    FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
    LIMIT 1
  `;
  if (projects.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (taskIds.length === 0) {
    return NextResponse.json({ success: true });
  }

  const priorities = taskIds.map((_: string, index: number) => index + 1);
  await db.query(
    `UPDATE tasks AS t
     SET priority = ordered.priority
     FROM UNNEST($1::uuid[], $2::int[]) AS ordered(id, priority)
     WHERE t.id = ordered.id AND t.project_id = $3`,
    [taskIds, priorities, projectId]
  );

  return NextResponse.json({ success: true });
}
