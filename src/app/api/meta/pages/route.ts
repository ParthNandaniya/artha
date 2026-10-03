import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";

const META_GRAPH_BASE = "https://graph.facebook.com/v21.0";

/**
 * GET /api/meta/pages?projectId=X
 * List Facebook Pages the user manages (required for creating ads).
 */
export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const connections = await db`
    SELECT access_token FROM social_connections
    WHERE project_id = ${projectId} AND platform = 'meta'
    LIMIT 1
  `;
  if (connections.length === 0) {
    return NextResponse.json({ error: "Meta not connected" }, { status: 400 });
  }

  const accessToken = connections[0].access_token as string;

  try {
    const url = new URL(`${META_GRAPH_BASE}/me/accounts`);
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("fields", "id,name,category,access_token");
    url.searchParams.set("limit", "50");

    const res = await fetch(url.toString());
    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error?.message || `Failed to fetch pages: ${res.status}`);
    }

    return NextResponse.json({
      pages: (data.data || []).map((p: Record<string, unknown>) => ({
        id: p.id,
        name: p.name,
        category: p.category,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch pages" },
      { status: 500 }
    );
  }
}
