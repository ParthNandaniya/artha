import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb, getWebsiteDbForProject } from "@/lib/neon";
import { FREE_DATA_TABLES, WEBSITE_SYSTEM_TABLES } from "@/lib/database/constants";
import { queryTableRows, getTableColumns } from "@/lib/database/query-builder";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tableName: string }> }
) {
  const { tableName } = await params;
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "50"), 100);
  const sortBy = searchParams.get("sortBy") || "created_at";
  const sortDir = (searchParams.get("sortDir") || "desc") as "asc" | "desc";
  const search = searchParams.get("search") || undefined;

  const isFreeTable = (FREE_DATA_TABLES as readonly string[]).includes(tableName);

  if (isFreeTable) {
    // Query platform DB with project_id filter
    const searchColumns = search ? ["email", "name"] : undefined;
    const result = await queryTableRows(db, tableName, { page, pageSize, sortBy, sortDir, search, searchColumns });
    // Filter by project_id (queryTableRows doesn't know about project_id)
    // We need to add project_id filter manually
    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM "${tableName}" WHERE project_id = $1`,
      [projectId]
    );
    const dataResult = await db.query(
      `SELECT * FROM "${tableName}" WHERE project_id = $1 ORDER BY "${sortBy}" ${sortDir === "asc" ? "ASC" : "DESC"} LIMIT $2 OFFSET $3`,
      [projectId, pageSize, (page - 1) * pageSize]
    );

    const columns = await getTableColumns(db, tableName);
    return NextResponse.json({
      rows: dataResult,
      total: (countResult[0]?.total as number) || 0,
      columns: columns.filter((c) => c.name !== "project_id"),
      page,
      pageSize,
    });
  }

  // Website DB table
  const websiteDb = await getWebsiteDbForProject(projectId);
  if (!websiteDb) {
    return NextResponse.json({ error: "No website database. Subscribe to enable." }, { status: 403 });
  }

  const searchColumns = search ? await getTextColumns(websiteDb, tableName) : undefined;
  const { rows, total } = await queryTableRows(websiteDb, tableName, { page, pageSize, sortBy, sortDir, search, searchColumns });
  const columns = await getTableColumns(websiteDb, tableName);

  return NextResponse.json({ rows, total, columns, page, pageSize });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tableName: string }> }
) {
  const { tableName } = await params;
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Cannot drop free or system tables
  if ((FREE_DATA_TABLES as readonly string[]).includes(tableName)) {
    return NextResponse.json({ error: "Cannot delete free data tables" }, { status: 400 });
  }
  if ((WEBSITE_SYSTEM_TABLES as readonly string[]).includes(tableName)) {
    return NextResponse.json({ error: "Cannot delete system tables" }, { status: 400 });
  }

  const websiteDb = await getWebsiteDbForProject(projectId);
  if (!websiteDb) {
    return NextResponse.json({ error: "No website database" }, { status: 403 });
  }

  await websiteDb.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
  await websiteDb`DELETE FROM _schema_registry WHERE table_name = ${tableName}`;

  return NextResponse.json({ success: true });
}

async function getTextColumns(db: ReturnType<typeof getDb>, tableName: string): Promise<string[]> {
  const cols = await db.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND data_type IN ('text', 'character varying') AND table_schema = 'public'`,
    [tableName]
  );
  return (cols as Array<{ column_name: string }>).map((c) => c.column_name);
}
