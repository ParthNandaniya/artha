import { NextResponse } from "next/server";
import { checkFreeToolLimit } from "@/lib/free-tools";
import { runSeoAgent } from "@/lib/agents/seo-agent";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const limitResponse = await checkFreeToolLimit("seo-audit", request);
    if (limitResponse) return limitResponse;

    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { success: false, error: "prompt is required" },
        { status: 400 }
      );
    }

    const result = await runSeoAgent({
      prompt: `Perform a comprehensive SEO audit for the following URL: ${prompt}`,
      context: `Target URL for SEO audit: ${prompt}`,
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
    console.error("[free-tool] seo-audit error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to perform SEO audit" },
      { status: 500 }
    );
  }
}
