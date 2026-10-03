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
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const events = await db`
    SELECT stripe_event_id, type, livemode, processed, created_at, error_message
    FROM stripe_webhook_events
    WHERE project_id = ${projectId}
    ORDER BY created_at DESC LIMIT 50
  `;

  return NextResponse.json(events);
}
