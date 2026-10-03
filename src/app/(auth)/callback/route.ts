import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/api/auth/callback${new URL(request.url).search}`);
}
