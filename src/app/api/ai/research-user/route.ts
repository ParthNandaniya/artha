import { NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { sendWelcomeEmail } from "@/lib/postmark";
import { gatherPersonResearchContext } from "@/lib/person-research";

export async function POST(request: Request) {
  try {
    const { userId } = await request.json();
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    const db = getDb();
    const users = await db`SELECT * FROM users WHERE id = ${userId}`;
    if (users.length === 0) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const user = users[0];

    const googleData = (user.google_data as Record<string, unknown>) || {};
    if (googleData.research && Object.keys(googleData).length > 1) {
      return NextResponse.json({ status: "already_researched" });
    }

    const personResearch = await gatherPersonResearchContext({
      name: (user.name as string) || "Unknown",
      email: (user.email as string) || "",
      searchDepth: "advanced",
      maxResultsPerQuery: 6,
      maxExtractUrls: 6,
    });

    const research = await generateAgentJSON<{
      summary: string;
      backgroundSummary: string;
      currentRole?: string;
      pastExperience: string[];
      skills: string[];
      strengths: string[];
      interests: string[];
      relevanceToProject: string;
      fitSignals: string[];
      riskSignals: string[];
      confidence: "high" | "medium" | "low";
      socialProfiles: Record<string, string>;
      notableLinks: string[];
      evidenceNotes: string[];
    }>(
      "pipeline_research_user",
      `You are a research assistant building a grounded profile of a person to personalize their startup-building experience.
Start from a clean slate. Do not assume role, seniority, or startup background unless the evidence supports it.
${personResearch.searchContext ? `\nUse the following live web research as a source:\n\n${personResearch.searchContext}\n` : ""}
${personResearch.extractedContext ? `\nUse the following extracted source content as your strongest evidence:\n\n${personResearch.extractedContext}\n` : ""}
Compile an accurate public-background profile. Be factual — only include details supported by the research above or clearly inferable from the email domain.

Return JSON with:
- summary: 2-4 sentences about who this person appears to be professionally
- backgroundSummary: concise summary of their public background/history
- currentRole?: current role/company if supported
- pastExperience: array of prior roles, projects, or public work
- skills: array of 4-8 likely technical or domain skills
- strengths: array of 3-6 strengths that seem supported by the evidence
- interests: array of 3-5 professional interests or focus areas
- relevanceToProject: short assessment of how their background might connect to the type of company they may build
- fitSignals: array of concrete signals supporting fit
- riskSignals: array of gaps, missing evidence, or reasons fit is unclear
- confidence: "high" | "medium" | "low"
- socialProfiles: object with keys like "linkedin", "twitter", "github", "website" if URLs found in research
- notableLinks: array of the most useful public URLs
- evidenceNotes: array of short evidence-backed notes or ambiguities`,
      `Research this person:
Name: ${user.name || "Unknown"}
Email domain: ${((user.email as string) || "").split("@")[1] || "Unknown"}`
    );

    const isNewUser = !googleData.welcomed;
    const updatedData = {
      ...googleData,
      research: {
        ...research,
        notableLinks: [...new Set([...(research.notableLinks || []), ...personResearch.sourceUrls])].slice(0, 8),
      },
      researched_at: new Date().toISOString(),
      welcomed: true,
    };
    await db`UPDATE users SET google_data = ${JSON.stringify(updatedData)}::jsonb WHERE id = ${userId}`;

    if (isNewUser && user.email) {
      sendWelcomeEmail(user.email as string, user.name as string | null).catch((err) =>
        console.error("Welcome email failed:", err)
      );
    }

    return NextResponse.json({ status: "ok", research: updatedData.research });
  } catch (error) {
    console.error("User research error:", error);
    return NextResponse.json({ error: "Research failed" }, { status: 500 });
  }
}
