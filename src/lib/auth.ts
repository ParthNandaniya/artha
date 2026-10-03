import { cookies } from "next/headers";
import { getDb } from "./neon";
import { reconcilePlatformEmailThreadsForUser } from "./platform-email";
import * as jose from "jose";

const SESSION_COOKIE = "artha_session";
const SESSION_DURATION_DAYS = 30;

export async function createSession(userId: string): Promise<string> {
  const db = getDb();
  const token = crypto.randomUUID() + "-" + crypto.randomUUID();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

  await db`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (${userId}, ${tokenHash}, ${expiresAt.toISOString()})
  `;

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

export async function getSession(): Promise<{ id: string; email: string; name: string | null; avatar_url: string | null } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = await hashToken(token);
  const db = getDb();

  const rows = await db`
    SELECT u.id, u.email, u.name, u.avatar_url
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash}
      AND s.expires_at > NOW()
    LIMIT 1
  `;

  if (rows.length === 0) return null;
  return rows[0] as { id: string; email: string; name: string | null; avatar_url: string | null };
}

/**
 * Convenience wrapper: returns the current session user or null.
 * Used by API routes that gate on authentication.
 */
export async function requireAuth() {
  return getSession();
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return;

  const tokenHash = await hashToken(token);
  const db = getDb();
  await db`DELETE FROM sessions WHERE token_hash = ${tokenHash}`;

  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}

export async function verifySessionFromRequest(request: Request): Promise<{ id: string; email: string; name: string | null } | null> {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;

  const token = match[1];
  const tokenHash = await hashToken(token);
  const db = getDb();

  const rows = await db`
    SELECT u.id, u.email, u.name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash}
      AND s.expires_at > NOW()
    LIMIT 1
  `;

  if (rows.length === 0) return null;
  return rows[0] as { id: string; email: string; name: string | null };
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Build redirect_uri from optional request origin (avoids mismatch in dev/proxy). */
function getRedirectUri(origin?: string): string {
  const base = origin ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const url = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${url}/api/auth/callback`;
}

/** @param returnPath - path to redirect to after sign-in (e.g. "/" or "/dashboard"), stored in state */
export function getGoogleOAuthUrl(origin?: string, returnPath?: string): string {
  const redirect_uri = getRedirectUri(origin);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
  });
  if (returnPath) params.set("state", returnPath);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri?: string
): Promise<{
  email: string;
  name: string;
  picture: string;
  sub: string;
}> {
  const redirect_uri = redirectUri ?? getRedirectUri();
  // Google token endpoint requires application/x-www-form-urlencoded, not JSON
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri,
    grant_type: "authorization_code",
  });
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const tokens = await tokenRes.json();

  if (!tokenRes.ok) {
    const msg =
      tokens.error_description ?? tokens.error ?? tokenRes.statusText;
    throw new Error(`Google token exchange failed: ${msg}`);
  }
  if (tokens.error) {
    throw new Error(
      `Google token error: ${tokens.error_description ?? tokens.error}`
    );
  }
  if (!tokens.id_token) {
    throw new Error("No id_token in response");
  }

  // Verify JWT signature against Google's public keys
  const JWKS = jose.createRemoteJWKSet(
    new URL("https://www.googleapis.com/oauth2/v3/certs")
  );
  const { payload: claims } = await jose.jwtVerify(tokens.id_token, JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: process.env.GOOGLE_CLIENT_ID!,
  });

  if (!claims.sub || !claims.email) {
    throw new Error("Missing required claims in Google ID token");
  }

  return {
    email: claims.email as string,
    name: (claims.name as string) || "",
    picture: (claims.picture as string) || "",
    sub: claims.sub,
  };
}

export async function upsertUser(googleUser: {
  email: string;
  name: string;
  picture: string;
  sub: string;
}): Promise<string> {
  const db = getDb();

  const existing = await db`
    SELECT id FROM users WHERE google_id = ${googleUser.sub}
  `;

  if (existing.length > 0) {
    await db`
      UPDATE users SET
        name = ${googleUser.name},
        avatar_url = ${googleUser.picture},
        email = ${googleUser.email}
      WHERE google_id = ${googleUser.sub}
    `;
    await reconcilePlatformEmailsSafely(existing[0].id as string, googleUser.email);
    return existing[0].id;
  }

  const existingByEmail = await db`
    SELECT id FROM users WHERE email = ${googleUser.email}
  `;

  if (existingByEmail.length > 0) {
    await db`
      UPDATE users SET
        name = ${googleUser.name},
        avatar_url = ${googleUser.picture},
        google_id = ${googleUser.sub}
      WHERE id = ${existingByEmail[0].id}
    `;
    await reconcilePlatformEmailsSafely(existingByEmail[0].id as string, googleUser.email);
    return existingByEmail[0].id;
  }

  const rows = await db`
    INSERT INTO users (email, name, avatar_url, google_id)
    VALUES (${googleUser.email}, ${googleUser.name}, ${googleUser.picture}, ${googleUser.sub})
    RETURNING id
  `;
  await reconcilePlatformEmailsSafely(rows[0].id as string, googleUser.email);
  return rows[0].id;
}

async function reconcilePlatformEmailsSafely(userId: string, email: string) {
  try {
    await reconcilePlatformEmailThreadsForUser(userId, email);
  } catch (error) {
    console.error("Failed to reconcile platform email threads for user:", error);
  }
}
