import { NextResponse } from "next/server";
import { checkFreeToolLimit } from "@/lib/free-tools";
import { generateAgentCompletion } from "@/lib/ai/agent-model-router";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const limitResponse = await checkFreeToolLimit(
      "privacy-policy-generator",
      request
    );
    if (limitResponse) return limitResponse;

    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { success: false, error: "prompt is required" },
        { status: 400 }
      );
    }

    const systemPrompt = `You are a legal document specialist. Generate a comprehensive Privacy Policy AND Terms of Service based on the user's company description.

Structure the output as:

# Privacy Policy
Include sections: Information We Collect, How We Use Information, Data Sharing, Cookies & Tracking, Data Retention, Your Rights (GDPR & CCPA), Children's Privacy, Security, Changes to Policy, Contact.

# Terms of Service
Include sections: Acceptance of Terms, Description of Service, User Accounts, Acceptable Use, Intellectual Property, Limitation of Liability, Termination, Governing Law, Changes to Terms, Contact.

Use professional legal language but keep it readable. Include [COMPANY NAME] and [EFFECTIVE DATE] placeholders where appropriate. Add a disclaimer at the top: "Note: This is an AI-generated template. Have it reviewed by a legal professional before publishing."

Format as clean, well-structured markdown.`;

    const content = await generateAgentCompletion(
      "free_tool",
      systemPrompt,
      prompt
    );

    return NextResponse.json({
      success: true,
      title: "Privacy Policy & Terms of Service",
      content,
    });
  } catch (error) {
    console.error("[free-tool] privacy-policy-generator error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate policy" },
      { status: 500 }
    );
  }
}
