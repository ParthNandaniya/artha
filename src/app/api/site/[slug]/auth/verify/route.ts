import { NextRequest, NextResponse } from "next/server";
import { hashToken, getProjectBySlug, getWebsiteDb } from "@/lib/site-api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const token = request.nextUrl.searchParams.get("token");

  const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
  const siteUrl = `https://${slug}.${companyDomain}`;

  if (!token) {
    return NextResponse.redirect(`${siteUrl}?verified=false`);
  }

  const project = await getProjectBySlug(slug);
  if (!project) {
    return NextResponse.redirect(`${siteUrl}?verified=false`);
  }

  const websiteDb = await getWebsiteDb(slug);
  if (!websiteDb) {
    return NextResponse.redirect(`${siteUrl}?verified=false`);
  }

  const tokenHash = await hashToken(token);

  const rows = await websiteDb`
    UPDATE site_users
    SET verified = TRUE,
        verification_token_hash = NULL,
        verification_token_expires_at = NULL
    WHERE verification_token_hash = ${tokenHash}
      AND verification_token_expires_at > NOW()
    RETURNING id
  `;

  if (rows.length === 0) {
    return NextResponse.redirect(`${siteUrl}?verified=false`);
  }

  return NextResponse.redirect(`${siteUrl}?verified=true`);
}
