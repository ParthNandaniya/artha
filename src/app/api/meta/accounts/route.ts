import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { listAdAccounts } from "@/lib/ads/meta-api";

/**
 * GET /api/meta/accounts?projectId=X
 * List ad accounts available to the connected Meta user.
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
    SELECT access_token, metadata FROM social_connections
    WHERE project_id = ${projectId} AND platform = 'meta'
    LIMIT 1
  `;
  if (connections.length === 0) {
    return NextResponse.json({ error: "Meta not connected" }, { status: 400 });
  }

  const accessToken = connections[0].access_token as string;

  try {
    const accounts = await listAdAccounts(accessToken);
    return NextResponse.json({
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        accountId: a.account_id,
        currency: a.currency,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch ad accounts" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/meta/accounts
 * Select an ad account and optionally a page for a project.
 * Body: { projectId, adAccountId, adAccountName?, pageId?, pageName? }
 */
export async function PATCH(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, adAccountId, adAccountName, pageId, pageName } = body;
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const connections = await db`
    SELECT metadata FROM social_connections
    WHERE project_id = ${projectId} AND platform = 'meta'
    LIMIT 1
  `;
  if (connections.length === 0) {
    return NextResponse.json({ error: "Meta not connected" }, { status: 400 });
  }

  const metadata = (connections[0].metadata || {}) as Record<string, unknown>;

  if (adAccountId !== undefined) {
    metadata.selectedAdAccountId = adAccountId;
    metadata.selectedAdAccountName = adAccountName || adAccountId;
  }
  if (pageId !== undefined) {
    metadata.selectedPageId = pageId;
    metadata.selectedPageName = pageName || pageId;
  }

  await db`
    UPDATE social_connections
    SET metadata = ${JSON.stringify(metadata)}::jsonb
    WHERE project_id = ${projectId} AND platform = 'meta'
  `;

  return NextResponse.json({ success: true, metadata });
}
