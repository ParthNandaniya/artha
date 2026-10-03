import { NextRequest, NextResponse } from "next/server";
import { runSupportAgent } from "@/lib/agents/artha-ops/support-agent";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runId, result, skipped } = await runSupportAgent("cron");
  return NextResponse.json({
    runId,
    summary: result.summary,
    actions: result.actions.length,
    skipped,
  });
}
