import { NextResponse } from "next/server";
import { checkFreeToolLimit } from "@/lib/free-tools";
import { runResearchAgent } from "@/lib/agents/research";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const limitResponse = await checkFreeToolLimit("market-research", request);
    if (limitResponse) return limitResponse;

    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { success: false, error: "prompt is required" },
        { status: 400 }
      );
    }

    const result = await runResearchAgent({
      prompt,
      context: `Conduct market research based on the following idea: ${prompt}`,
      projectId: "free-tool",
      userId: "anonymous",
      metadata: { researchType: "market_research", executionSource: "pipeline" },
    });

    const doc = result.documents?.[0];

    return NextResponse.json({
      success: result.success,
      title: doc?.title ?? null,
      content: doc?.content ?? null,
      metadata: doc?.metadata ?? null,
    });
  } catch (error) {
    console.error("[free-tool] market-research error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate market research" },
      { status: 500 }
    );
  }
}
