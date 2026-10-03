import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { getDb } from "@/lib/neon";
import type { ModelTaskName } from "@/lib/types";

// ═══════════════════════════════════════════════════════════════════════════
// Brand Voice — AI-powered writing style analysis & profile generation
// ═══════════════════════════════════════════════════════════════════════════

export interface VoiceAnalysis {
  tone: string;
  formality: "very_informal" | "informal" | "neutral" | "formal" | "very_formal";
  vocabularyLevel: "simple" | "intermediate" | "advanced" | "technical";
  avgSentenceLength: number;
  personalityTraits: string[];
  industryJargon: string[];
  examples: {
    characteristic: string;
    quote: string;
  }[];
}

export interface VoiceProfile {
  analysis: VoiceAnalysis;
  systemPromptSnippet: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Analyze 3-5 writing samples to extract brand voice characteristics.
 */
export async function analyzeWritingSamples(
  samples: string[]
): Promise<VoiceAnalysis> {
  if (samples.length === 0) {
    throw new Error("At least one writing sample is required");
  }

  const samplesText = samples
    .map((s, i) => `--- Sample ${i + 1} ---\n${s.slice(0, 3000)}`)
    .join("\n\n");

  const systemPrompt = `You are a writing style analyst. Analyze the provided writing samples and extract the brand voice characteristics. Be specific and precise in your analysis. Return JSON only.`;

  const userPrompt = `Analyze these writing samples and return a JSON object with:
- tone: a 2-3 word description of the overall tone (e.g., "confident and direct", "warm and conversational")
- formality: one of "very_informal", "informal", "neutral", "formal", "very_formal"
- vocabularyLevel: one of "simple", "intermediate", "advanced", "technical"
- avgSentenceLength: estimated average sentence length in words (number)
- personalityTraits: array of 3-5 personality traits (e.g., "witty", "authoritative", "empathetic")
- industryJargon: array of industry-specific terms or phrases used frequently
- examples: array of 2-3 objects with { characteristic, quote } where characteristic describes a writing pattern and quote is a short illustrative excerpt

Writing samples:
${samplesText}`;

  const result = await generateAgentJSON<VoiceAnalysis>(
    "content_planner" as ModelTaskName,
    systemPrompt,
    userPrompt,
    { temperature: 0.3 }
  );

  return result;
}

/**
 * Generate a system prompt snippet from a voice analysis that can be injected
 * into content generation agents.
 */
export function generateVoiceProfile(analysis: VoiceAnalysis): string {
  const traits = analysis.personalityTraits.join(", ");
  const jargon =
    analysis.industryJargon.length > 0
      ? `Use industry terms naturally: ${analysis.industryJargon.join(", ")}.`
      : "";

  const formalityMap: Record<string, string> = {
    very_informal: "very casual, like texting a friend",
    informal: "relaxed and approachable, like a blog post",
    neutral: "balanced, neither too casual nor too formal",
    formal: "professional and polished",
    very_formal: "highly professional and corporate",
  };

  const vocabMap: Record<string, string> = {
    simple: "Use simple, everyday language. Avoid jargon unless necessary.",
    intermediate: "Use clear language with occasional technical terms when helpful.",
    advanced: "Use sophisticated vocabulary and complex sentence structures.",
    technical: "Use precise technical language. Assume reader expertise.",
  };

  return [
    `BRAND VOICE GUIDELINES:`,
    `- Tone: ${analysis.tone}`,
    `- Writing style: ${formalityMap[analysis.formality] || "balanced"}`,
    `- Personality: Be ${traits}`,
    `- Sentence length: Target ~${analysis.avgSentenceLength} words per sentence`,
    `- ${vocabMap[analysis.vocabularyLevel] || "Use clear language."}`,
    jargon,
    analysis.examples
      .map((e) => `- ${e.characteristic}: "${e.quote}"`)
      .join("\n"),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Fetch the stored voice profile for a project.
 */
export async function getVoiceProfile(
  projectId: string
): Promise<VoiceProfile | null> {
  const db = getDb();
  const rows = await db`
    SELECT settings->>'voice_profile' AS voice_profile
    FROM projects
    WHERE id = ${projectId}
  `;

  if (rows.length === 0) return null;

  const raw = rows[0].voice_profile;
  if (!raw) return null;

  try {
    return typeof raw === "string" ? JSON.parse(raw) : (raw as VoiceProfile);
  } catch {
    return null;
  }
}

/**
 * Save the voice profile to project settings.
 */
export async function saveVoiceProfile(
  projectId: string,
  profile: VoiceProfile
): Promise<void> {
  const db = getDb();
  await db`
    UPDATE projects
    SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('voice_profile', ${JSON.stringify(profile)}::jsonb)
    WHERE id = ${projectId}
  `;
}

/**
 * Full pipeline: analyze samples, generate profile, and save.
 */
export async function trainBrandVoice(
  projectId: string,
  samples: string[]
): Promise<VoiceProfile> {
  const analysis = await analyzeWritingSamples(samples);
  const systemPromptSnippet = generateVoiceProfile(analysis);
  const now = new Date().toISOString();

  const profile: VoiceProfile = {
    analysis,
    systemPromptSnippet,
    createdAt: now,
    updatedAt: now,
  };

  await saveVoiceProfile(projectId, profile);
  return profile;
}
