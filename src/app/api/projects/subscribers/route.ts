import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { getSubscribersByProject, getSubscriberSummary } from "@/lib/marketplace";

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();
  const projects = await db`
    SELECT id FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
    LIMIT 1
  `;
  if (projects.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [subscribers, summary] = await Promise.all([
    getSubscribersByProject(projectId),
    getSubscriberSummary(projectId),
  ]);

  return NextResponse.json({ subscribers, summary });
}
