import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";

export async function PATCH(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, leadIds, updates } = await request.json();
  if (!projectId || !Array.isArray(leadIds) || leadIds.length === 0 || !leadIds.every((leadId) => typeof leadId === "string")) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
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

  await db`
    UPDATE leads
    SET status = COALESCE(${updates.status ?? null}, status),
        contacted = COALESCE(${updates.contacted ?? null}, contacted),
        contacted_at = COALESCE(${updates.contacted_at ?? null}, contacted_at),
        updated_at = NOW()
    WHERE id = ANY(${leadIds}::uuid[]) AND project_id = ${projectId}
  `;

  return NextResponse.json({ success: true, updated: leadIds.length });
}
