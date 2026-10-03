import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode, upsertUser, createSession } from "@/lib/auth";

/** Allow only same-origin paths (no // or protocol-relative). */
function safeReturnPath(state: string | null): string {
  if (!state || typeof state !== "string") return "/dashboard";
  const path = state.trim();
  if (!path.startsWith("/") || path.startsWith("//")) return "/dashboard";
  return path || "/dashboard";
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

  if (!code) {
    return NextResponse.redirect(new URL("/?error=no_code", origin));
  }

  const returnPath = safeReturnPath(request.nextUrl.searchParams.get("state"));
  const redirectUri = `${origin}/api/auth/callback`;

  try {
    const googleUser = await exchangeGoogleCode(code, redirectUri);
    const userId = await upsertUser(googleUser);
    await createSession(userId);
    return NextResponse.redirect(new URL(returnPath, origin));
  } catch (error) {
    console.error("Auth callback error:", error);
    return NextResponse.redirect(new URL("/?error=auth_failed", origin));
  }
}
