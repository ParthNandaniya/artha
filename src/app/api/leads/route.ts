import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

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

  try {
    const leads = await db`
      SELECT * FROM leads WHERE project_id = ${projectId} ORDER BY score DESC, created_at DESC
    `;
    return NextResponse.json(leads);
  } catch {
    return NextResponse.json([]);
  }
}

export async function PATCH(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, leadId, updates } = await request.json();
  if (!projectId || !leadId) {
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

  if (
    updates.status === undefined
    && updates.contacted === undefined
    && updates.contacted_at === undefined
    && updates.notes === undefined
  ) {
    return NextResponse.json({ error: "No updates" }, { status: 400 });
  }

  await db`
    UPDATE leads SET
      status = COALESCE(${updates.status ?? null}, status),
      contacted = COALESCE(${updates.contacted ?? null}, contacted),
      contacted_at = COALESCE(${updates.contacted_at ?? null}, contacted_at),
      notes = COALESCE(${updates.notes ?? null}, notes),
      updated_at = NOW()
    WHERE id = ${leadId} AND project_id = ${projectId}
  `;

  return NextResponse.json({ success: true });
}
