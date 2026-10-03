import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { corsHeaders, handlePreflight, createRateLimiter, getClientIp, hashPassword, hashToken, createSiteSession, getProjectBySlug, getWebsiteDb, jsonResponse } from "@/lib/site-api";
import { sendSiteVerificationEmail, isPostmarkConfigured } from "@/lib/postmark";

const isRateLimited = createRateLimiter(5);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  let body: { email?: string; password?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  // Validate email
  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return jsonResponse({ error: "Valid email is required" }, 400, origin);
  }

  // Validate password
  const password = body.password;
  if (!password || password.length < 8) {
    return jsonResponse({ error: "Password must be at least 8 characters" }, 400, origin);
  }

  const name = body.name?.trim().slice(0, 100) || null;

  // Check duplicate
  const existing = await websiteDb`
    SELECT id FROM site_users WHERE email = ${email} LIMIT 1
  `;
  if (existing.length > 0) {
    return jsonResponse({ error: "Email already registered" }, 409, origin);
  }

  // Hash password + create user
  const passwordHash = await hashPassword(password);
  const verificationToken = randomUUID();
  const verificationTokenHash = await hashToken(verificationToken);
  const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const rows = await websiteDb`
    INSERT INTO site_users (email, name, password_hash, verified, verification_token_hash, verification_token_expires_at)
    VALUES (${email}, ${name}, ${passwordHash}, FALSE, ${verificationTokenHash}, ${verificationExpiresAt})
    RETURNING id, email, name, credits, verified, created_at
  `;

  const user = rows[0];
  const token = await createSiteSession(websiteDb, user.id as string);

  // Send verification email (non-blocking, don't fail signup if email fails)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tryartha.com";
  const verifyUrl = `${appUrl}/api/site/${slug}/auth/verify?token=${verificationToken}`;

  if (isPostmarkConfigured("company")) {
    sendSiteVerificationEmail({
      slug,
      companyName: project.name,
      toEmail: email,
      verifyUrl,
    }).catch((err) => console.error("Verification email failed:", err));
  }

  return jsonResponse(
    {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        credits: Number(user.credits) || 0,
        verified: false,
      },
      token,
    },
    201,
    origin
  );
}
