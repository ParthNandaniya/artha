import { NextRequest, NextResponse } from "next/server";
import { getGoogleOAuthUrl } from "@/lib/auth";
import { StartWithPromptSchema, parseBody } from "@/lib/validation";

const PENDING_PROMPT_COOKIE = "artha_pending_prompt";
const COOKIE_MAX_AGE = 600; // 10 minutes

export async function POST(request: NextRequest) {
  let prompt: string;
  try {
    const body = await request.json();
    const parsed = parseBody(StartWithPromptSchema, body);
    prompt = parsed.success ? parsed.data.prompt.trim() : "";
  } catch {
    prompt = "";
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const returnPath = "/dashboard";
  const redirectUrl = getGoogleOAuthUrl(origin, returnPath);
  const res = NextResponse.json({ redirectUrl });

  if (prompt) {
    res.cookies.set(PENDING_PROMPT_COOKIE, prompt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
  }

  return res;
}
