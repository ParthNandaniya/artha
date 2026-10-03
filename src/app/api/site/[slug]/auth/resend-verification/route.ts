import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { handlePreflight, createRateLimiter, getClientIp, hashToken, getProjectBySlug, getWebsiteDb, requireSiteUser, isErrorResponse, jsonResponse } from "@/lib/site-api";
import { sendSiteVerificationEmail, isPostmarkConfigured } from "@/lib/postmark";

const isRateLimited = createRateLimiter(2);

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

  const userOrError = await requireSiteUser(request, websiteDb, origin);
  if (isErrorResponse(userOrError)) return userOrError;

  if (userOrError.verified) {
    return jsonResponse({ error: "Already verified" }, 400, origin);
  }

  // Generate new token
  const verificationToken = randomUUID();
  const verificationTokenHash = await hashToken(verificationToken);
  const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await websiteDb`
    UPDATE site_users
    SET verification_token_hash = ${verificationTokenHash},
        verification_token_expires_at = ${verificationExpiresAt}
    WHERE id = ${userOrError.id}
  `;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tryartha.com";
  const verifyUrl = `${appUrl}/api/site/${slug}/auth/verify?token=${verificationToken}`;

  if (isPostmarkConfigured("company")) {
    await sendSiteVerificationEmail({
      slug,
      companyName: project.name,
      toEmail: userOrError.email,
      verifyUrl,
    });
  }

  return jsonResponse({ ok: true }, 200, origin);
}
