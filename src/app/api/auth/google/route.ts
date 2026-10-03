import { NextRequest, NextResponse } from "next/server";
import { getGoogleOAuthUrl } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const returnPath = request.nextUrl.searchParams.get("return") ?? "/";
  const url = getGoogleOAuthUrl(origin, returnPath);
  return NextResponse.redirect(url);
}
