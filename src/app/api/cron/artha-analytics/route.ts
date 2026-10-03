import { NextRequest, NextResponse } from "next/server";
import { runAnalyticsBIAgent } from "@/lib/agents/artha-ops/analytics-agent";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Weekly on Sundays, daily otherwise
  const dayOfWeek = new Date().getDay();
  const mode = dayOfWeek === 0 ? "weekly" : "daily";

  const { runId, result, skipped } = await runAnalyticsBIAgent(mode);
  return NextResponse.json({ runId, mode, summary: result.summary, skipped });
}
