import { NextRequest, NextResponse } from "next/server";
import { runReplyEngine } from "@/lib/growth/reply-engine";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if social auto-reply is disabled via env var
  if (process.env.SOCIAL_AUTO_REPLY_ENABLED === "false") {
    return NextResponse.json({
      processed: 0,
      replied: 0,
      skipped: 0,
      errors: 0,
      replies: [],
      message: "Social auto-reply is disabled (SOCIAL_AUTO_REPLY_ENABLED=false).",
    });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry") === "true";
  const max = parseInt(url.searchParams.get("max") || "5", 10);
  const platform = url.searchParams.get("platform") as "twitter" | "bluesky" | "all" | null;

  const result = await runReplyEngine({
    dryRun,
    maxReplies: Math.min(max, 10),
    platform: platform || "all",
  });

  return NextResponse.json({
    processed: result.processed,
    replied: result.replied,
    skipped: result.skipped,
    errors: result.errors,
    replies: result.replies,
  });
}
