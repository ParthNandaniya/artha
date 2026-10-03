import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionFromRequest } from "@/lib/auth";

const PENDING_PROMPT_COOKIE = "artha_pending_prompt";

export async function GET(request: Request) {
  const user = await verifySessionFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cookieStore = await cookies();
  const prompt = cookieStore.get(PENDING_PROMPT_COOKIE)?.value ?? null;

  const res = NextResponse.json({ prompt });
  res.cookies.set(PENDING_PROMPT_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return res;
}
