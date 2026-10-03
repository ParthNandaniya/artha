import { generateAgentCompletion } from "@/lib/ai/agent-model-router";
import { ProjectMemory } from "@/lib/memory";
import { multiPass, contentCritique } from "@/lib/ai/multi-pass";
import { searchWebMulti } from "@/lib/search";

export async function generateMission(
  companyPrompt: string,
  memory: ProjectMemory,
  userBackground?: string
): Promise<{ title: string; content: string; metadata: Record<string, unknown> }> {
  const companyName = typeof memory.companyName === "string" && memory.companyName.trim()
    ? memory.companyName.trim()
    : undefined;
  const tagline = typeof memory.tagline === "string" && memory.tagline.trim()
    ? memory.tagline.trim()
    : undefined;

  const systemPrompt = `You are a seasoned startup strategist and operator helping a founder crystallize their company's direction. Generate a comprehensive, opinionated mission document in Markdown format.

Quality standards:
- Be specific and concrete — avoid generic startup language ("we help businesses scale" tells us nothing)
- The mission statement should be a single sentence a 10-year-old could understand and a CEO would be proud of
- The problem section must describe a specific, painful, real problem — not a vague market observation
- The value proposition must clearly explain what makes this different from the 5 existing alternatives a customer might use today
- The 90-day strategy must contain 3-5 specific, executable initiatives — not themes or platitudes

Document structure (use these exact Markdown headers):
1. **Company Name & Tagline** — memorable, specific, and meaningful
2. **Mission Statement** — one clear sentence: "We [do X] for [who] so they can [outcome]"
3. **Vision** — where this company is in 5 years if everything goes right
4. **Problem** — the specific pain point, who feels it, and why existing solutions fail
5. **Solution** — how this company uniquely solves the problem
6. **Target Audience** — detailed ideal customer profile (role, company type, pain level, buying behavior)
7. **Value Proposition** — the 3 specific reasons a customer chooses this over all alternatives
8. **First 90 Days** — concrete initiatives to get to first 100 customers or prove the core hypothesis
9. **Financial Projections** — estimated monthly P&L for months 1-12, monthly burn rate, runway estimate, and key unit economics (CAC, LTV, payback period). Ground these estimates in industry benchmarks and comparable companies. Be realistic — most startups lose money in the first 6-12 months.

Identity requirements:
- If an exact company name is provided, use that exact name in the document and do not invent, rename, or substitute another brand
- If an exact tagline is provided, keep it aligned with the same company identity
- Keep all strategy, positioning, and research framed around the provided company identity

Write with conviction and precision. This document should make a smart investor or early customer immediately understand what the company does and why it will win.`;

  const userPromptText = `${companyName ? `Exact company name: ${companyName}\nUse this exact company name in the "Company Name & Tagline" section and throughout the document.\n` : ""}${tagline ? `Existing tagline: ${tagline}\n` : ""}Company idea: ${companyPrompt}
${userBackground ? `\nFounder background: ${userBackground}` : ""}
${memory.keyInsights?.length ? `\nPrevious insights: ${memory.keyInsights.join(", ")}` : ""}`;

  try {
    const multiPassResult = await multiPass<string>({
      // ── Research: industry benchmarks ──
      researchFn: async () => {
        try {
          // Extract the vertical/industry from the prompt for targeted search
          const shortPrompt = companyPrompt.slice(0, 100);
          const results = await searchWebMulti(
            [
              `${shortPrompt} startup unit economics benchmarks CAC LTV`,
              `${shortPrompt} industry burn rate revenue milestones early stage`,
            ],
            {
              depth: "fast",
              maxResultsPerQuery: 3,
            },
          );

          const contextParts: string[] = [];
          for (const res of results) {
            if (res.results) {
              for (const r of res.results) {
                contextParts.push(`- ${r.title}: ${r.content?.slice(0, 200) || r.url}`);
              }
            }
          }
          return contextParts.length > 0
            ? `Industry research:\n${contextParts.join("\n")}`
            : "";
        } catch {
          return "";
        }
      },

      // ── Generate: main mission generation ──
      generateFn: async (researchContext: string) => {
        const enhancedUserPrompt = researchContext
          ? `${userPromptText}\n\nIndustry research for financial projections:\n${researchContext}`
          : userPromptText;

        return generateAgentCompletion("research", systemPrompt, enhancedUserPrompt, {
          maxTokens: 4000,
        });
      },

      // ── Critique: evaluate mission quality ──
      critiqueFn: async (output: string) => {
        return contentCritique(
          output,
          "business plan/mission",
          `Is the mission statement genuinely unique? Is the 90-day plan specific with concrete initiatives? Are financial projections grounded in industry data? Does the document avoid generic startup language?`,
        );
      },

      // ── Refine: re-generate with feedback ──
      refineFn: async (output: string, feedback: string, researchContext: string) => {
        const refinePrompt = `Here is a mission/business plan that needs improvement. Rewrite it addressing the following feedback while keeping all good parts.

FEEDBACK:
${feedback}

CURRENT DOCUMENT:
${output.slice(0, 3000)}

${researchContext ? `Industry research:\n${researchContext}` : ""}

${userPromptText}

Rewrite the full document addressing the feedback.`;

        return generateAgentCompletion("research", systemPrompt, refinePrompt, {
          maxTokens: 4000,
        });
      },

      maxRefinements: 1,
      qualityThreshold: 3.5,
    });

    let content = multiPassResult.result;

    // Verify company name usage (existing logic)
    if (companyName && !missionUsesCompanyName(content, companyName)) {
      content = await generateAgentCompletion(
        "research",
        `You are correcting a mission document so it uses the founder's exact company identity.

Instructions:
- Replace any invented or inconsistent company name with the exact company name provided
- Keep the same mission, positioning, and structure unless a naming change requires a small wording adjustment
- Ensure the "Company Name & Tagline" section uses the exact company name
- Output only the corrected Markdown document`,
        `Exact company name: ${companyName}
${tagline ? `Exact tagline: ${tagline}\n` : ""}Mission document to correct:

${content}`,
        { maxTokens: 4000 }
      );
    }

    return {
      title: "Company Mission & Strategy",
      content,
      metadata: {
        companyName,
        companyPrompt,
        generatedAt: new Date().toISOString(),
        tagline,
        multiPassPasses: multiPassResult.passes,
      },
    };
  } catch (error) {
    // Fallback: run the original single-pass generation
    console.warn("[mission-generator] Multi-pass failed, falling back to single-pass:", error);

    let content = await generateAgentCompletion("research", systemPrompt, userPromptText, {
      maxTokens: 4000,
    });

    if (companyName && !missionUsesCompanyName(content, companyName)) {
      content = await generateAgentCompletion(
        "research",
        `You are correcting a mission document so it uses the founder's exact company identity.

Instructions:
- Replace any invented or inconsistent company name with the exact company name provided
- Keep the same mission, positioning, and structure unless a naming change requires a small wording adjustment
- Ensure the "Company Name & Tagline" section uses the exact company name
- Output only the corrected Markdown document`,
        `Exact company name: ${companyName}
${tagline ? `Exact tagline: ${tagline}\n` : ""}Mission document to correct:

${content}`,
        { maxTokens: 4000 }
      );
    }

    return {
      title: "Company Mission & Strategy",
      content,
      metadata: {
        companyName,
        companyPrompt,
        generatedAt: new Date().toISOString(),
        tagline,
      },
    };
  }
}

function missionUsesCompanyName(content: string, companyName: string): boolean {
  const expected = companyName.trim().toLowerCase();
  const identityLine = extractMissionIdentityLine(content);

  if (identityLine) {
    return identityLine.toLowerCase().includes(expected);
  }

  return content.toLowerCase().includes(expected);
}

function extractMissionIdentityLine(content: string): string | undefined {
  const lines = content.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => /company name\s*&\s*tagline/i.test(line));

  if (headingIndex === -1) return undefined;

  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (line) return line;
  }

  return undefined;
}
