import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { TwitterApi } from "twitter-api-v2";

const SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"];

/**
 * GET /api/twitter/connect?projectId=X
 * Generates a Twitter OAuth 2.0 authorization URL for connecting a company Twitter account.
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

  const clientId = process.env.TWITTER_CLIENT_ID?.trim();
  const clientSecret = process.env.TWITTER_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Twitter app credentials not configured" }, { status: 503 });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/twitter/callback`;

  const client = new TwitterApi({ clientId, clientSecret });
  const { url, codeVerifier, state } = client.generateOAuth2AuthLink(redirectUri, {
    scope: SCOPES,
  });

  // Store state and verifier in platform_settings for callback
  const stateKey = `twitter_oauth:${state}`;
  const stateValue = JSON.stringify({ codeVerifier, projectId, userId: user.id, redirectUri });
  await db`
    INSERT INTO platform_settings (key, value)
    VALUES (${stateKey}, ${stateValue})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;

  return NextResponse.json({ url });
}

/**
 * DELETE /api/twitter/connect?projectId=X
 * Disconnect a company Twitter account.
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

  await db`DELETE FROM social_connections WHERE project_id = ${projectId} AND platform = 'twitter'`;

  return NextResponse.json({ success: true });
}
