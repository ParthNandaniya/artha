import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";

const META_SCOPES = "ads_management,ads_read,pages_show_list,pages_read_engagement,business_management";

/**
 * GET /api/meta/connect?projectId=X
 * Generates a Meta OAuth 2.0 authorization URL for connecting a customer's ad account.
 */
export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const appId = process.env.META_APP_ID?.trim();
  if (!appId) {
    return NextResponse.json({ error: "Meta app credentials not configured" }, { status: 503 });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/meta/callback`;
  const state = `${projectId}:${user.id}:${crypto.randomUUID().slice(0, 8)}`;

  // Store state for verification
  const stateKey = `meta_oauth:${state}`;
  await db`
    INSERT INTO platform_settings (key, value)
    VALUES (${stateKey}, ${JSON.stringify({ projectId, userId: user.id, redirectUri })})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;

  const authUrl = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scope", META_SCOPES);
  authUrl.searchParams.set("response_type", "code");

  return NextResponse.json({ url: authUrl.toString() });
}

/**
 * DELETE /api/meta/connect?projectId=X
 * Disconnect Meta ad account.
 */
export async function DELETE(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await db`DELETE FROM social_connections WHERE project_id = ${projectId} AND platform = 'meta'`;

  return NextResponse.json({ success: true });
}
