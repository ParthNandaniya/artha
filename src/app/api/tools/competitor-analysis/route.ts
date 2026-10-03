import { NextResponse } from "next/server";
import { checkFreeToolLimit } from "@/lib/free-tools";
import { runCompetitiveMonitorAgent } from "@/lib/agents/competitive-monitor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const limitResponse = await checkFreeToolLimit("competitor-analysis", request);
    if (limitResponse) return limitResponse;

    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { success: false, error: "prompt is required" },
        { status: 400 }
      );
    }

    const result = await runCompetitiveMonitorAgent({
      prompt: `Perform a competitive analysis for the following company and competitors: ${prompt}`,
      context: `Company and competitor information: ${prompt}`,
      projectId: "free-tool",
      userId: "anonymous",
      metadata: { executionSource: "pipeline" },
    });

    const doc = result.documents?.[0];

    return NextResponse.json({
      success: result.success,
      summary: result.summary ?? null,
      content: doc?.content ?? null,
    });
  } catch (error) {
    console.error("[free-tool] competitor-analysis error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to perform competitive analysis" },
      { status: 500 }
    );
  }
}
