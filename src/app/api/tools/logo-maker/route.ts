import { NextResponse } from "next/server";
import { checkFreeToolLimit } from "@/lib/free-tools";
import { generateLogos } from "@/lib/ai/logo/generate-logo";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const limitResponse = await checkFreeToolLimit("logo-maker", request);
    if (limitResponse) return limitResponse;

    const { companyName, industry, style } = await request.json();

    if (!companyName || typeof companyName !== "string") {
      return NextResponse.json(
        { success: false, error: "companyName is required" },
        { status: 400 }
      );
    }

    const result = await generateLogos({
      companyName,
      industry,
      primaryColor: "#1a1a1a",
      accentColor: "#f97316",
      styles: ["minimal", "modern", "tech", "playful"],
    });

    return NextResponse.json({
      success: true,
      variants: result.variants,
    });
  } catch (error) {
    console.error("[free-tool] logo-maker error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate logos" },
      { status: 500 }
    );
  }
}
