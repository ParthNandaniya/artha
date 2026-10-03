import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";

/**
 * GET /api/social-connections?projectId=X
 * List all social connections for a project.
 */
export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const connections = await db`
    SELECT platform, account_name, account_id, expires_at, metadata, created_at
    FROM social_connections
    WHERE project_id = ${projectId}
    ORDER BY created_at DESC
  `;

  return NextResponse.json(
    connections.map((c: Record<string, unknown>) => ({
      platform: c.platform,
      accountName: c.account_name,
      accountId: c.account_id,
      expiresAt: c.expires_at,
      connected: true,
      metadata: c.metadata || null,
    })),
  );
}
