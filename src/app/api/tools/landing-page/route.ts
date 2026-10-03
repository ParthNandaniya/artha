import { NextResponse } from "next/server";
import { checkFreeToolLimit } from "@/lib/free-tools";
import { generateLandingPage } from "@/lib/ai/website-builder/landing-page-builder";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const limitResponse = await checkFreeToolLimit("landing-page", request);
    if (limitResponse) return limitResponse;

    const { prompt, companyName } = await request.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { success: false, error: "prompt is required" },
        { status: 400 }
      );
    }

    const html = await generateLandingPage(
      prompt,
      { companyDescription: prompt, companyName },
      "free-tool-preview",
      companyName
    );

    return NextResponse.json({
      success: true,
      html,
    });
  } catch (error) {
    console.error("[free-tool] landing-page error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate landing page" },
      { status: 500 }
    );
  }
}
