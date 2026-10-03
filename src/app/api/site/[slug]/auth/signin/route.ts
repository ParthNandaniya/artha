import { NextRequest } from "next/server";
import { corsHeaders, handlePreflight, createRateLimiter, getClientIp, verifyPassword, createSiteSession, getProjectBySlug, getWebsiteDb, jsonResponse } from "@/lib/site-api";

const isRateLimited = createRateLimiter(10);

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const origin = request.headers.get("origin");

  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return jsonResponse({ error: "Too many requests. Please wait a minute." }, 429, origin);
  }

  const project = await getProjectBySlug(slug);
  if (!project) return jsonResponse({ error: "Not found" }, 404, origin);

  const websiteDb = await getWebsiteDb(slug);
  if (!websiteDb) {
    return jsonResponse({ error: "Database not available" }, 403, origin);
  }

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!email || !password) {
    return jsonResponse({ error: "Email and password are required" }, 400, origin);
  }

  // Look up user
  const rows = await websiteDb`
    SELECT id, email, name, password_hash, credits, verified, created_at
    FROM site_users
    WHERE email = ${email}
    LIMIT 1
  `;
  if (rows.length === 0) {
    return jsonResponse({ error: "Invalid credentials" }, 401, origin);
  }

  const user = rows[0];
  const passwordHash = user.password_hash as string | null;
  if (!passwordHash) {
    return jsonResponse({ error: "Invalid credentials" }, 401, origin);
  }

  const valid = await verifyPassword(password, passwordHash);
  if (!valid) {
    return jsonResponse({ error: "Invalid credentials" }, 401, origin);
  }

  // Update last sign in
  await websiteDb`
    UPDATE site_users SET last_sign_in_at = NOW() WHERE id = ${user.id}
  `;

  const token = await createSiteSession(websiteDb, user.id as string);

  return jsonResponse(
    {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        credits: Number(user.credits) || 0,
        verified: Boolean(user.verified),
      },
      token,
    },
    200,
    origin
  );
}
