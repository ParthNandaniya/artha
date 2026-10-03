import { NextRequest, NextResponse } from "next/server";
import { runOutboundEngine } from "@/lib/growth/outbound-engine";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Kill switch
  if (process.env.OUTBOUND_ENGAGEMENT_ENABLED === "false") {
    return NextResponse.json({
      discovered: 0,
      replied: 0,
      skipped: 0,
      manual: 0,
      errors: 0,
      engagements: [],
      message: "Outbound engagement is disabled (OUTBOUND_ENGAGEMENT_ENABLED=false).",
    });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry") === "true";
  const max = parseInt(url.searchParams.get("max") || "5", 10);
  const platform = url.searchParams.get("platform") as
    | "twitter"
    | "bluesky"
    | "reddit"
    | "all"
    | null;

  const result = await runOutboundEngine({
    dryRun,
    maxReplies: Math.min(max, 20),
    platform: platform || "all",
  });

  return NextResponse.json(result);
}
