import { NextResponse } from "next/server";
import { checkFreeToolLimit } from "@/lib/free-tools";
import { generateAgentCompletion } from "@/lib/ai/agent-model-router";
import {
  extractWeb,
  searchWebMulti,
  findSimilar,
  formatSearchContext,
  formatExtractContext,
  formatFindSimilarContext,
} from "@/lib/search";

export const runtime = "nodejs";
export const maxDuration = 120;

// ── Helpers ───────────────────────────────────────────────────────────

function normalizeUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

function extractCompanyName(
  title: string | null,
  url: string
): string {
  if (title) {
    // Split on common separators: " - ", " | ", " : ", " — ", " – "
    const name = title.split(/\s[-|:—–]\s/)[0].trim();
    if (name.length > 1 && name.length < 60) return name;
  }
  // Fallback: hostname without TLD
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host.split(".")[0].charAt(0).toUpperCase() + host.split(".")[0].slice(1);
  } catch {
    return "This Company";
  }
}

// ── System prompt ─────────────────────────────────────────────────────

const ROAST_SYSTEM_PROMPT = `You are the world's most savage yet data-driven company roaster. You combine the analytical precision of a McKinsey consultant with the comedic timing of a stand-up comedian. Your roasts are brutal but FAIR — every joke is grounded in real data from the research provided.

Rules:
1. ONLY roast things supported by the research data. Never fabricate facts, metrics, or claims.
2. Be genuinely funny — think "comedy roast" not "hit piece." The tone should make even employees of the company laugh.
3. Use specific data points, quotes from reviews, funding numbers, and competitor comparisons to make jokes land harder.
4. If the research data is thin on a topic, skip that section entirely rather than making things up.
5. Write in markdown format.
6. Keep the total roast between 600-900 words — long enough to be thorough, short enough to be shareable.
7. Make every section punchy and quotable. People will screenshot this.

Output the roast in this EXACT structure:

# 🔥 [Company Name] — The Roast

**Roast Score: X/10**
[One devastating one-liner that captures the company's essence in a sentence]

## What They Think They Do vs What They Actually Do
[Compare the company's self-image from their homepage marketing copy with the reality from reviews, news, and user feedback. Use their own marketing language against them. Be specific.]

## The Competition Called...
[Use the competitor and similar company data to deliver shade. Compare them unfavorably to specific alternatives by name. "Why use X when Y exists?" energy.]

## What The Internet Really Thinks
[Pull from reviews, complaints, public sentiment, and news. Paraphrase specific complaints for comedic effect. If Glassdoor/culture data exists, include it.]

## Investor Reality Check
[If funding data exists, roast the valuation, investor decisions, or burn rate. If no funding data exists, skip this section ENTIRELY — do not write it.]

## The Final Burn
[A devastating closing paragraph that ties everything together. End with a backhanded compliment — acknowledge one genuinely good thing about the company, then twist the knife one final time.]

---
*Roasted with real data by [Artha](https://artha.run/tools/company-roast). The burns are free. The truth hurts more.*`;

// ── Route handler ─────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const limitResponse = await checkFreeToolLimit("company-roast", request);
    if (limitResponse) return limitResponse;

    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { success: false, error: "A company URL is required" },
        { status: 400 }
      );
    }

    const url = normalizeUrl(prompt);

    // Basic URL validation
    if (!/^https?:\/\/[^\s]+\.[^\s]+/.test(url)) {
      return NextResponse.json(
        { success: false, error: "Please enter a valid URL" },
        { status: 400 }
      );
    }

    // ── Stage 1: Extract homepage ──────────────────────────────────
    const homepageResult = await extractWeb([url], { depth: "basic" });
    const homepage = homepageResult.results[0];
    const companyName = extractCompanyName(homepage?.title ?? null, url);
    const homepageContext = homepageResult.results.length > 0
      ? formatExtractContext(homepageResult.results)
      : "[Homepage extraction failed — using search data only]";

    // ── Stage 2 & 3: Deep search + competitor discovery (parallel) ─
    const searchQueries = [
      `"${companyName}" reviews complaints problems users`,
      `"${companyName}" funding investors valuation fundraise`,
      `"${companyName}" news 2025 2026 latest`,
      `"${companyName}" vs competitors alternatives`,
      `"${companyName}" glassdoor culture employees layoffs`,
    ];

    const ownDomain = (() => {
      try { return new URL(url).hostname.replace(/^www\./, ""); }
      catch { return ""; }
    })();

    const [searchResults, similarResults] = await Promise.all([
      searchWebMulti(searchQueries, { maxResultsPerQuery: 5 }),
      findSimilar(url, {
        maxResults: 5,
        excludeDomains: ownDomain ? [ownDomain] : undefined,
      }),
    ]);

    const searchContext = formatSearchContext(searchResults);
    const competitorContext = formatFindSimilarContext(similarResults);

    // Check if we have ANY useful data
    const hasData = homepageResult.results.length > 0
      || searchResults.some((s) => s.results.length > 0)
      || similarResults.results.length > 0;

    if (!hasData) {
      return NextResponse.json(
        {
          success: false,
          error: "Could not find enough information about this company. Try a more well-known company URL.",
        },
        { status: 422 }
      );
    }

    // ── Stage 4: Generate roast ────────────────────────────────────
    const researchContext = [
      "=== Company Homepage ===",
      homepageContext,
      "",
      searchContext,
      "",
      competitorContext,
    ]
      .filter(Boolean)
      .join("\n");

    const userPrompt = `Roast this company: ${companyName} (${url})

Here is everything I found about them:

${researchContext}

Now write the most savage, data-driven roast you can. Remember: every joke must be backed by the data above. Be funny, be brutal, be fair.`;

    const roast = await generateAgentCompletion(
      "free_tool",
      ROAST_SYSTEM_PROMPT,
      userPrompt,
      { temperature: 0.9, maxTokens: 4096 }
    );

    return NextResponse.json({
      success: true,
      companyName,
      content: roast,
    });
  } catch (error) {
    console.error("[free-tool] company-roast error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate roast" },
      { status: 500 }
    );
  }
}
