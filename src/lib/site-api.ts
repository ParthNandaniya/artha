import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { getDb, getWebsiteDbForSlug, getWebsiteDbForProject } from "@/lib/neon";

type WebsiteDb = NeonQueryFunction<false, false>;

// ── CORS ─────────────────────────────────────────────────────────────

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    !origin ||
    origin.endsWith(".tryartha.com") ||
    origin === "https://tryartha.com" ||
    process.env.NODE_ENV === "development";

  return {
    "Access-Control-Allow-Origin": allowed ? (origin ?? "*") : "null",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

/** Handle CORS preflight (OPTIONS) requests. */
export function handlePreflight(request: NextRequest): NextResponse {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

// ── Rate Limiting ────────────────────────────────────────────────────

/** Factory for in-memory per-IP rate limiters. */
export function createRateLimiter(limit: number, windowMs: number = 60_000) {
  const map = new Map<string, { count: number; resetAt: number }>();

  return function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = map.get(ip);
    if (!entry || now > entry.resetAt) {
      map.set(ip, { count: 1, resetAt: now + windowMs });
      return false;
    }
    if (entry.count >= limit) return true;
    entry.count++;
    return false;
  };
}

/** Extract client IP from request headers. */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

// ── Password Hashing (PBKDF2 via Web Crypto — zero dependencies) ────

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;
const SESSION_EXPIRY_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    HASH_BITS
  );
  const saltHex = Buffer.from(salt).toString("hex");
  const hashHex = Buffer.from(hash).toString("hex");
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [saltHex, expectedHashHex] = storedHash.split(":");
  if (!saltHex || !expectedHashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    HASH_BITS
  );
  const hashHex = Buffer.from(hash).toString("hex");

  // Constant-time comparison
  if (hashHex.length !== expectedHashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < hashHex.length; i++) {
    diff |= hashHex.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
  }
  return diff === 0;
}

// ── Token Hashing ────────────────────────────────────────────────────

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(hash).toString("hex");
}

// ── Session Management ───────────────────────────────────────────────

export type SiteUser = {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  credits: number;
  verified: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function createSiteSession(
  websiteDb: WebsiteDb,
  siteUserId: string
): Promise<string> {
  const token = `${randomUUID()}-${randomUUID()}`;
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(
    Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  await websiteDb`
    INSERT INTO site_sessions (site_user_id, token_hash, expires_at)
    VALUES (${siteUserId}, ${tokenHash}, ${expiresAt})
  `;

  return token;
}

export async function verifySiteSession(
  websiteDb: WebsiteDb,
  token: string
): Promise<SiteUser | null> {
  const tokenHash = await hashToken(token);
  const rows = await websiteDb`
    SELECT u.id, u.email, u.name, u.avatar_url,
           u.credits, u.verified, u.metadata, u.created_at
    FROM site_sessions s
    INNER JOIN site_users u ON u.id = s.site_user_id
    WHERE s.token_hash = ${tokenHash}
      AND s.expires_at > NOW()
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string | null,
    avatar_url: row.avatar_url as string | null,
    credits: Number(row.credits) || 0,
    verified: Boolean(row.verified),
    metadata: (row.metadata as Record<string, unknown>) || {},
    created_at: String(row.created_at),
  };
}

export async function destroySiteSession(
  websiteDb: WebsiteDb,
  token: string
): Promise<void> {
  const tokenHash = await hashToken(token);
  await websiteDb`
    DELETE FROM site_sessions WHERE token_hash = ${tokenHash}
  `;
}

// ── Project + DB lookups ─────────────────────────────────────────────

export async function getProjectBySlug(
  slug: string
): Promise<{ id: string; name: string; slug: string } | null> {
  const db = getDb();
  const rows = await db`
    SELECT id, name, slug FROM projects WHERE slug = ${slug} LIMIT 1
  `;
  if (rows.length === 0) return null;
  return {
    id: rows[0].id as string,
    name: rows[0].name as string,
    slug: rows[0].slug as string,
  };
}

export async function getWebsiteDb(slug: string): Promise<WebsiteDb | null> {
  return getWebsiteDbForSlug(slug);
}

// ── Auth extraction ──────────────────────────────────────────────────

function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

/** Get site user from bearer token. Returns null if not authenticated. */
export async function getSiteUser(
  request: Request,
  websiteDb: WebsiteDb
): Promise<SiteUser | null> {
  const token = extractBearerToken(request);
  if (!token) return null;
  return verifySiteSession(websiteDb, token);
}

/** Require authenticated site user. Returns user or a 401 response. */
export async function requireSiteUser(
  request: Request,
  websiteDb: WebsiteDb,
  origin: string | null
): Promise<SiteUser | NextResponse> {
  const user = await getSiteUser(request, websiteDb);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders(origin) }
    );
  }
  return user;
}

// ── Response helpers ─────────────────────────────────────────────────

export function jsonResponse(
  data: unknown,
  status: number,
  origin: string | null
): NextResponse {
  return NextResponse.json(data, { status, headers: corsHeaders(origin) });
}

/** Check if a value is a NextResponse (error response from requireSiteUser). */
export function isErrorResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

// ── Credit utilities ─────────────────────────────────────────────────

/**
 * Add credits to a site user in the isolated DB.
 * Looks up user by siteUserId first, falls back to email.
 * Returns true if credits were added successfully.
 */
export async function addSiteUserCredits(args: {
  projectId: string;
  siteUserId?: string | null;
  siteUserEmail?: string | null;
  credits: number;
  reason: string;
}): Promise<boolean> {
  const { projectId, siteUserId, siteUserEmail, credits, reason } = args;
  if (credits <= 0) return false;
  if (!siteUserId && !siteUserEmail) return false;

  const websiteDb = await getWebsiteDbForProject(projectId);
  if (!websiteDb) return false;

  try {
    // Find user by ID or email
    let userId: string | null = null;

    if (siteUserId) {
      const rows = await websiteDb`
        SELECT id FROM site_users WHERE id = ${siteUserId} LIMIT 1
      `;
      if (rows.length > 0) userId = rows[0].id as string;
    }

    if (!userId && siteUserEmail) {
      const rows = await websiteDb`
        SELECT id FROM site_users WHERE email = ${siteUserEmail.toLowerCase()} LIMIT 1
      `;
      if (rows.length > 0) userId = rows[0].id as string;
    }

    if (!userId) return false;

    // Add credits
    const result = await websiteDb`
      UPDATE site_users
      SET credits = credits + ${credits}
      WHERE id = ${userId}
      RETURNING credits
    `;

    if (result.length === 0) return false;
    const newBalance = Number(result[0].credits);

    // Log transaction
    await websiteDb`
      INSERT INTO credit_transactions (site_user_id, amount, type, reason, balance_after)
      VALUES (${userId}, ${credits}, 'credit', ${reason}, ${newBalance})
    `;

    return true;
  } catch (err) {
    console.error("addSiteUserCredits error:", err);
    return false;
  }
}

/**
 * Look up the credit_amount for a pricing plan from platform DB.
 */
export async function getPlanCreditAmount(planId: string): Promise<number> {
  const db = getDb();
  const rows = await db`
    SELECT credit_amount FROM project_pricing_plans WHERE id = ${planId} LIMIT 1
  `;
  return Number(rows[0]?.credit_amount) || 0;
}
