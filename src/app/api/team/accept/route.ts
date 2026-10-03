import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { acceptInvitation } from "@/lib/project-auth";

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { token } = body;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  try {
    const result = await acceptInvitation(token, user.id);
    if (!result) {
      return NextResponse.json({ error: "Invalid, expired, or already accepted invitation" }, { status: 400 });
    }
    return NextResponse.json({ success: true, projectId: result.projectId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to accept invitation" }, { status: 500 });
  }
}
