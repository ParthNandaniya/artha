import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import { listAdAccounts } from "@/lib/ads/meta-api";

/**
 * GET /api/meta/callback?code=X&state=Y
 * Meta OAuth 2.0 callback handler.
 * Exchanges code for long-lived token, fetches ad accounts, stores connection.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const errorParam = request.nextUrl.searchParams.get("error");

  if (errorParam || !code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard?error=meta_auth_failed", request.url)
    );
  }

  const db = getDb();

  // Retrieve stored OAuth state
  const stateKey = `meta_oauth:${state}`;
  const rows = await db`SELECT value FROM platform_settings WHERE key = ${stateKey}`;
  if (rows.length === 0) {
    return NextResponse.redirect(
      new URL("/dashboard?error=meta_state_expired", request.url)
    );
  }

  const { projectId, userId, redirectUri } = JSON.parse(rows[0].value as string);
  await db`DELETE FROM platform_settings WHERE key = ${stateKey}`;

  // Verify project ownership
  const projects = await db`SELECT id, slug FROM projects WHERE id = ${projectId} AND user_id = ${userId}`;
  if (projects.length === 0) {
    return NextResponse.redirect(
      new URL("/dashboard?error=project_not_found", request.url)
    );
  }

  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    return NextResponse.redirect(
      new URL("/dashboard?error=meta_not_configured", request.url)
    );
  }

  try {
    // 1. Exchange code for short-lived token
    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenResponse = await fetch(tokenUrl.toString());
    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }
    const tokenData = await tokenResponse.json();
    const shortLivedToken = tokenData.access_token;

    // 2. Exchange for long-lived token (60 days)
    const longLivedUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
    longLivedUrl.searchParams.set("client_id", appId);
    longLivedUrl.searchParams.set("client_secret", appSecret);
    longLivedUrl.searchParams.set("fb_exchange_token", shortLivedToken);

    const longLivedResponse = await fetch(longLivedUrl.toString());
    let accessToken = shortLivedToken;
    let expiresIn = 3600;

    if (longLivedResponse.ok) {
      const longLivedData = await longLivedResponse.json();
      accessToken = longLivedData.access_token || shortLivedToken;
      expiresIn = longLivedData.expires_in || 5184000; // 60 days default
    }

    // 3. Get user info
    const meUrl = new URL("https://graph.facebook.com/v21.0/me");
    meUrl.searchParams.set("access_token", accessToken);
    meUrl.searchParams.set("fields", "id,name");

    const meResponse = await fetch(meUrl.toString());
    let accountName = "Meta User";
    let metaUserId = "";

    if (meResponse.ok) {
      const meData = await meResponse.json();
      accountName = meData.name || "Meta User";
      metaUserId = meData.id || "";
    }

    // 4. Get ad accounts
    let adAccounts: Array<{ id: string; name: string; account_id: string; currency: string }> = [];
    try {
      adAccounts = await listAdAccounts(accessToken);
    } catch {
      // User may not have ad accounts yet — that's OK, they can configure later
    }

    // Pick the first active ad account, or the first one
    const activeAccount = adAccounts.find((a) => (a as Record<string, unknown>).account_status === 1) || adAccounts[0];

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 5. Store connection
    const metadata = {
      scopes: "ads_management,ads_read,pages_show_list,pages_read_engagement,business_management",
      metaUserId,
      adAccounts: adAccounts.map((a) => ({
        id: a.id,
        name: a.name,
        accountId: a.account_id,
        currency: a.currency,
      })),
      selectedAdAccountId: activeAccount?.id || null,
      selectedAdAccountName: activeAccount?.name || null,
    };

    await db`
      INSERT INTO social_connections (project_id, platform, access_token, account_id, account_name, expires_at, metadata)
      VALUES (
        ${projectId}, 'meta', ${accessToken}, ${metaUserId}, ${accountName},
        ${expiresAt}, ${JSON.stringify(metadata)}::jsonb
      )
      ON CONFLICT (project_id, platform) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        account_id = EXCLUDED.account_id,
        account_name = EXCLUDED.account_name,
        expires_at = EXCLUDED.expires_at,
        metadata = EXCLUDED.metadata
    `;

    const slug = projects[0].slug as string;
    return NextResponse.redirect(
      new URL(`/dashboard/${slug}?panel=ads&meta_connected=true`, request.url)
    );
  } catch (error) {
    console.error("Meta OAuth callback error:", error);
    const slug = projects[0]?.slug as string;
    return NextResponse.redirect(
      new URL(`/dashboard/${slug}?panel=ads&error=meta_auth_failed`, request.url)
    );
  }
}
