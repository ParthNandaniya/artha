import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import { TwitterApi } from "twitter-api-v2";

/**
 * GET /api/twitter/callback?code=X&state=Y
 * Twitter OAuth 2.0 callback handler. Exchanges authorization code for tokens
 * and stores the connection in social_connections.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard?error=twitter_auth_failed", request.url),
    );
  }

  const db = getDb();

  // Retrieve stored OAuth state
  const stateKey = `twitter_oauth:${state}`;
  const rows = await db`SELECT value FROM platform_settings WHERE key = ${stateKey}`;
  if (rows.length === 0) {
    return NextResponse.redirect(
      new URL("/dashboard?error=twitter_state_expired", request.url),
    );
  }

  const { codeVerifier, projectId, userId, redirectUri } = JSON.parse(rows[0].value as string);

  // Clean up state
  await db`DELETE FROM platform_settings WHERE key = ${stateKey}`;

  // Verify project ownership
  const projects = await db`SELECT id, slug FROM projects WHERE id = ${projectId} AND user_id = ${userId}`;
  if (projects.length === 0) {
    return NextResponse.redirect(
      new URL("/dashboard?error=project_not_found", request.url),
    );
  }

  const clientId = process.env.TWITTER_CLIENT_ID?.trim();
  const clientSecret = process.env.TWITTER_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/dashboard?error=twitter_not_configured", request.url),
    );
  }

  try {
    const client = new TwitterApi({ clientId, clientSecret });
    const {
      accessToken,
      refreshToken,
      expiresIn,
    } = await client.loginWithOAuth2({
      code,
      codeVerifier,
      redirectUri,
    });

    // Get user info
    const loggedClient = new TwitterApi(accessToken);
    const me = await loggedClient.v2.me();
    const accountName = me.data.username;
    const accountId = me.data.id;

    const expiresAt = new Date(Date.now() + (expiresIn || 7200) * 1000).toISOString();

    // Store connection
    await db`
      INSERT INTO social_connections (project_id, platform, access_token, refresh_token, account_id, account_name, expires_at, metadata)
      VALUES (
        ${projectId}, 'twitter', ${accessToken}, ${refreshToken || null},
        ${accountId}, ${accountName}, ${expiresAt},
        ${JSON.stringify({ scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"] })}::jsonb
      )
      ON CONFLICT (project_id, platform) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        account_id = EXCLUDED.account_id,
        account_name = EXCLUDED.account_name,
        expires_at = EXCLUDED.expires_at,
        metadata = EXCLUDED.metadata
    `;

    const slug = projects[0].slug as string;
    return NextResponse.redirect(
      new URL(`/dashboard/${slug}?panel=twitter&connected=true`, request.url),
    );
  } catch (error) {
    console.error("Twitter OAuth callback error:", error);
    const slug = projects[0]?.slug as string;
    return NextResponse.redirect(
      new URL(`/dashboard/${slug}?panel=twitter&error=twitter_auth_failed`, request.url),
    );
  }
}
