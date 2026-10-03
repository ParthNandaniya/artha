import { NextRequest, NextResponse } from "next/server";
import { runProductAgent } from "@/lib/agents/artha-ops/product-agent";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runId, result, skipped } = await runProductAgent("cron");
  return NextResponse.json({ runId, summary: result.summary, skipped });
}
