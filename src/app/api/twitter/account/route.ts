import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getTwitterAccountStatus } from "@/lib/twitter";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = await getTwitterAccountStatus({ validate: true });
  return NextResponse.json(status);
}
