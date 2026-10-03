import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createConnectManagementLink } from "@/lib/marketplace";

export async function POST() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await createConnectManagementLink(user.id);
  return NextResponse.json(result);
}
