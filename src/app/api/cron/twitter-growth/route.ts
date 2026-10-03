import { NextRequest, NextResponse } from "next/server";
import { runGrowthBot } from "@/lib/growth/runner";
import type { ContentSlot } from "@/lib/growth/scheduler";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const category = url.searchParams.get("category") as ContentSlot | null;
  const count = parseInt(url.searchParams.get("count") || "2", 10);
  const dryRun = url.searchParams.get("dry") === "true";

  const result = await runGrowthBot({
    dryRun,
    category: category || undefined,
    count: Math.min(count, 5),
  });

  return NextResponse.json({
    posted: result.posted.length,
    skipped: result.skipped,
    errors: result.errors,
    tweets: result.posted.map((p) => ({
      category: p.category,
      urls: p.tweetUrls,
      topic: p.topic,
    })),
  });
}
