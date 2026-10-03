import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb, getWebsiteDbForProject } from "@/lib/neon";
import { FREE_DATA_TABLES, WEBSITE_SYSTEM_TABLES } from "@/lib/database/constants";
import type { TableInfo } from "@/lib/database/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const projects = await db`SELECT id, subscription_status FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tables: TableInfo[] = [];

  // Free tables (always available from platform DB)
  for (const tableName of FREE_DATA_TABLES) {
    try {
      const countResult = await db.query(
        `SELECT COUNT(*)::int AS cnt FROM "${tableName}" WHERE project_id = $1`,
        [projectId]
      ) as { cnt: number }[];
      tables.push({
        name: tableName,
        display_name: tableName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        description: null,
        category: "free",
        row_count: (countResult[0]?.cnt as number) || 0,
        columns: [],
      });
    } catch {
      // Table may not exist yet
    }
  }

  // Website DB tables (requires subscription)
  const websiteDb = await getWebsiteDbForProject(projectId);
  if (websiteDb) {
    // System tables
    for (const tableName of WEBSITE_SYSTEM_TABLES) {
      if (tableName === "_schema_registry") continue;
      try {
        const countResult = await websiteDb.query(
          `SELECT COUNT(*)::int AS cnt FROM "${tableName}"`
        ) as { cnt: number }[];
        tables.push({
          name: tableName,
          display_name: tableName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          description: null,
          category: "system",
          row_count: (countResult[0]?.cnt as number) || 0,
          columns: [],
        });
      } catch {
        // Table may not exist yet
      }
    }

    // Custom tables from registry
    try {
      const registry = await websiteDb`SELECT * FROM _schema_registry ORDER BY created_at`;
      for (const entry of registry) {
        try {
          const countResult = await websiteDb.query(
            `SELECT COUNT(*)::int AS cnt FROM "${entry.table_name}"`
          );
          tables.push({
            name: entry.table_name as string,
            display_name: entry.display_name as string,
            description: entry.description as string | null,
            category: "custom",
            row_count: (countResult[0]?.cnt as number) || 0,
            columns: (entry.columns || []) as TableInfo["columns"],
          });
        } catch {
          // Table may have been dropped outside registry
        }
      }
    } catch {
      // _schema_registry may not exist
    }
  }

  return NextResponse.json({
    tables,
    hasWebsiteDb: !!websiteDb,
    subscribed: projects[0].subscription_status === "active",
  });
}
