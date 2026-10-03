import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb, getWebsiteDbForProject } from "@/lib/neon";
import { FREE_DATA_TABLES } from "@/lib/database/constants";
import { insertRow, updateRow, deleteRow } from "@/lib/database/query-builder";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tableName: string }> }
) {
  const { tableName } = await params;
  const body = await request.json();
  const { projectId, data } = body;
  if (!projectId || !data) return NextResponse.json({ error: "Missing projectId or data" }, { status: 400 });

  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isFreeTable = (FREE_DATA_TABLES as readonly string[]).includes(tableName);

  if (isFreeTable) {
    const row = await insertRow(db, tableName, { ...data, project_id: projectId });
    return NextResponse.json(row);
  }

  const websiteDb = await getWebsiteDbForProject(projectId);
  if (!websiteDb) return NextResponse.json({ error: "No website database" }, { status: 403 });

  const row = await insertRow(websiteDb, tableName, data);
  return NextResponse.json(row);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tableName: string }> }
) {
  const { tableName } = await params;
  const body = await request.json();
  const { projectId, rowId, data } = body;
  if (!projectId || !rowId || !data) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isFreeTable = (FREE_DATA_TABLES as readonly string[]).includes(tableName);

  if (isFreeTable) {
    const row = await updateRow(db, tableName, rowId, data);
    return NextResponse.json(row);
  }

  const websiteDb = await getWebsiteDbForProject(projectId);
  if (!websiteDb) return NextResponse.json({ error: "No website database" }, { status: 403 });

  const row = await updateRow(websiteDb, tableName, rowId, data);
  return NextResponse.json(row);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tableName: string }> }
) {
  const { tableName } = await params;
  const body = await request.json();
  const { projectId, rowId } = body;
  if (!projectId || !rowId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isFreeTable = (FREE_DATA_TABLES as readonly string[]).includes(tableName);

  if (isFreeTable) {
    await deleteRow(db, tableName, rowId);
    return NextResponse.json({ success: true });
  }

  const websiteDb = await getWebsiteDbForProject(projectId);
  if (!websiteDb) return NextResponse.json({ error: "No website database" }, { status: 403 });

  await deleteRow(websiteDb, tableName, rowId);
  return NextResponse.json({ success: true });
}
