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
    const tags = await db`SELECT * FROM research_tags WHERE project_id = ${projectId} ORDER BY created_at ASC`;
    return NextResponse.json(tags);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, tag, label, description } = await request.json();
  if (!projectId || !tag || !label) {
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

  const result = await db`
    INSERT INTO research_tags (project_id, tag, label, description)
    VALUES (${projectId}, ${tag}, ${label}, ${description || null})
    ON CONFLICT (project_id, tag) DO UPDATE SET label = ${label}, description = ${description || null}
    RETURNING *
  `;

  return NextResponse.json(result[0]);
}

export async function DELETE(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const tagId = searchParams.get("id");
  const projectId = searchParams.get("projectId");
  if (!tagId || !projectId) {
    return NextResponse.json({ error: "Missing id or projectId" }, { status: 400 });
  }

  const db = getDb();
  const projects = await db`
    SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id} LIMIT 1
  `;
  if (projects.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db`DELETE FROM research_tags WHERE id = ${tagId} AND project_id = ${projectId}`;
  return NextResponse.json({ ok: true });
}
