import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";

/**
 * GET /api/linkedin/callback?code=X&state=Y
 * LinkedIn OAuth 2.0 callback handler.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const errorParam = request.nextUrl.searchParams.get("error");

  if (errorParam || !code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard?error=linkedin_auth_failed", request.url),
    );
  }

  const db = getDb();

  // Retrieve stored OAuth state
  const stateKey = `linkedin_oauth:${state}`;
  const rows = await db`SELECT value FROM platform_settings WHERE key = ${stateKey}`;
  if (rows.length === 0) {
    return NextResponse.redirect(
      new URL("/dashboard?error=linkedin_state_expired", request.url),
    );
  }

  const { projectId, userId, redirectUri } = JSON.parse(rows[0].value as string);
  await db`DELETE FROM platform_settings WHERE key = ${stateKey}`;

  // Verify project ownership
  const projects = await db`SELECT id, slug FROM projects WHERE id = ${projectId} AND user_id = ${userId}`;
  if (projects.length === 0) {
    return NextResponse.redirect(
      new URL("/dashboard?error=project_not_found", request.url),
    );
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim();
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/dashboard?error=linkedin_not_configured", request.url),
    );
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    const expiresIn = tokenData.expires_in || 5184000; // Default 60 days

    // Get user profile
    const profileResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let accountName = "LinkedIn User";
    let accountId = "";

    if (profileResponse.ok) {
      const profile = await profileResponse.json();
      accountName = profile.name || `${profile.given_name || ""} ${profile.family_name || ""}`.trim();
      accountId = profile.sub || "";
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Store connection (including refresh token for automatic renewal)
    await db`
      INSERT INTO social_connections (project_id, platform, access_token, refresh_token, account_id, account_name, expires_at, metadata)
      VALUES (
        ${projectId}, 'linkedin', ${accessToken}, ${refreshToken}, ${accountId}, ${accountName},
        ${expiresAt}, ${JSON.stringify({ scopes: "openid profile email w_member_social" })}::jsonb
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
      new URL(`/dashboard/${slug}?panel=settings&linkedin_connected=true`, request.url),
    );
  } catch (error) {
    console.error("LinkedIn OAuth callback error:", error);
    const slug = projects[0]?.slug as string;
    return NextResponse.redirect(
      new URL(`/dashboard/${slug}?panel=settings&error=linkedin_auth_failed`, request.url),
    );
  }
}
