import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";

export async function GET(request: Request) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId)
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();

  // Verify project ownership
  const projectRows = await db`
    SELECT id FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
    LIMIT 1
  `;
  if (projectRows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 200);

  const activities = await db`
    SELECT id, agent_type, action, title, description, metadata, created_at
    FROM agent_activity
    WHERE project_id = ${projectId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return NextResponse.json(activities);
}
