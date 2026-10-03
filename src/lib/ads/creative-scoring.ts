import { generateAgentJSON } from "@/lib/ai/agent-model-router";

// ── Types ────────────────────────────────────────────────────────────

export interface CreativeInput {
  headline: string;
  description: string;
  ctaText: string;
  imageDescription?: string;
  targetAudience?: string;
}

export interface ScoreBreakdown {
  headlineClarity: number;   // 0-25
  ctaStrength: number;       // 0-25
  visualQuality: number;     // 0-25
  emotionalAppeal: number;   // 0-25
}

export interface CreativeScore {
  score: number;             // 0-100
  breakdown: ScoreBreakdown;
  suggestions: string[];
}

// ── Scoring ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert advertising creative analyst. Score the given ad creative on four dimensions, each 0-25 points:

1. **Headline Clarity** (0-25): Is the headline clear, concise, and immediately communicates the value proposition? Higher scores for specificity and lack of jargon.
2. **CTA Strength** (0-25): Is the call-to-action compelling, action-oriented, and creates urgency? Higher scores for clear next steps.
3. **Visual Quality** (0-25): Based on the image description (if any), does the visual support the message? If no image description is provided, score based on how well the text alone conveys the message visually. Higher scores for relevance and clarity.
4. **Emotional Appeal** (0-25): Does the creative evoke an emotional response aligned with the target audience? Higher scores for authenticity and resonance.

Return a JSON object with:
- score: total score (sum of all four dimensions, 0-100)
- breakdown: { headlineClarity, ctaStrength, visualQuality, emotionalAppeal }
- suggestions: array of 2-4 specific, actionable improvement suggestions`;

/**
 * Score an ad creative 0-100 using AI analysis.
 * Breaks down into four 25-point dimensions: headline clarity,
 * CTA strength, visual quality, and emotional appeal.
 */
export async function scoreCreative(creative: CreativeInput): Promise<CreativeScore> {
  const parts = [
    `Headline: "${creative.headline}"`,
    `Description: "${creative.description}"`,
    `CTA: "${creative.ctaText}"`,
  ];

  if (creative.imageDescription) {
    parts.push(`Image description: "${creative.imageDescription}"`);
  }
  if (creative.targetAudience) {
    parts.push(`Target audience: "${creative.targetAudience}"`);
  }

  const userPrompt = `Score this ad creative:\n\n${parts.join("\n")}`;

  const result = await generateAgentJSON<CreativeScore>(
    "quality_judge",
    SYSTEM_PROMPT,
    userPrompt,
    { temperature: 0.3 },
  );

  // Clamp values to valid ranges
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));

  const breakdown: ScoreBreakdown = {
    headlineClarity: clamp(result.breakdown.headlineClarity, 25),
    ctaStrength: clamp(result.breakdown.ctaStrength, 25),
    visualQuality: clamp(result.breakdown.visualQuality, 25),
    emotionalAppeal: clamp(result.breakdown.emotionalAppeal, 25),
  };

  const score = breakdown.headlineClarity + breakdown.ctaStrength + breakdown.visualQuality + breakdown.emotionalAppeal;

  return {
    score,
    breakdown,
    suggestions: Array.isArray(result.suggestions) ? result.suggestions.slice(0, 4) : [],
  };
}
