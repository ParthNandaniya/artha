import { NextRequest, NextResponse } from "next/server";
import { runBatchPipeline } from "@/lib/shorts-pipeline/runner";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Default: 2 videos per cron run (run 3x daily = ~6 videos/day for testing)
    const url = new URL(request.url);
    const count = Math.min(Number(url.searchParams.get("count") || "2"), 5);
    const dryRun = url.searchParams.get("dry_run") === "true";

    console.log(`[shorts-pipeline-cron] Starting batch: ${count} videos, dryRun=${dryRun}`);

    const results = await runBatchPipeline(count, {
      projectId: null, // Artha internal
      autoApprove: true,
      platforms: ["twitter", "bluesky"],
      dryRun,
    });

    const posted = results.filter((r) => r.status === "posted").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const pending = results.filter((r) => r.status === "pending_approval").length;

    console.log(`[shorts-pipeline-cron] Done: ${posted} posted, ${failed} failed, ${pending} pending`);

    return NextResponse.json({
      success: true,
      count: results.length,
      posted,
      failed,
      pending,
      results: results.map((r) => ({
        id: r.videoShortId,
        topic: r.topic,
        category: r.category,
        status: r.status,
        posts: r.postResults,
        error: r.error,
      })),
    });
  } catch (error) {
    console.error("[shorts-pipeline-cron] Fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pipeline failed" },
      { status: 500 },
    );
  }
}
