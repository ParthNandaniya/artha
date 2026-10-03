/**
 * Viral Script Writer
 *
 * Generates short-form video scripts optimized for virality.
 * Research-backed, hook-first, with platform-specific captions.
 */

import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import type { ContentCategory, DiscoveredTopic, PostingPlatform, VideoScript } from "./types";

interface ScriptResponse {
  script: string;
  hook: string;
  cta: string;
  captions: Record<string, string>;
  duration_estimate_seconds: number;
}

export async function writeViralScript(
  topic: DiscoveredTopic,
  options?: {
    voiceStyle?: string;
    duration?: "short" | "medium" | "long";
    platforms?: PostingPlatform[];
  },
): Promise<VideoScript> {
  const duration = options?.duration || "short";
  const durationGuide = {
    short: "15-30 seconds (~40-75 words)",
    medium: "30-45 seconds (~75-110 words)",
    long: "45-60 seconds (~110-150 words)",
  }[duration];

  const platforms = options?.platforms || ["twitter", "bluesky"];

  const systemPrompt = `You are the world's best short-form video scriptwriter. You write scripts that go VIRAL on social media. Every script you write gets millions of views.

SCRIPT STRUCTURE (${durationGuide}):
1. HOOK (first 2 seconds): A scroll-stopping opening. Use one of:
   - Shocking stat: "90% of startups fail because of THIS..."
   - Bold claim: "AI just made $100K jobs obsolete"
   - Question: "Why is nobody talking about this?"
   - Controversy: "Unpopular opinion: coding is dead"
2. BODY (main content): 2-3 key points. Each point is ONE sentence. Use specific numbers and examples.
3. CTA (last 3 seconds): "Follow for more" / "Save this" / "Drop a comment"

VOICE STYLE: ${options?.voiceStyle || "energetic"} — conversational, NOT corporate. Write like you're telling a friend something mind-blowing.

RULES:
- NO filler words (basically, actually, literally)
- NO questions in the middle (only in hook or CTA)
- Use PAUSES (marked with "...") for dramatic effect
- Every sentence must add value — cut anything that doesn't
- Write for SPOKEN delivery — read it out loud in your mind
- Back claims with specific numbers from the research data
- DO NOT make up statistics — use only what's in the research

RESEARCH DATA:
${topic.researchData}

CAPTIONS: Write a platform-specific caption for each: ${platforms.join(", ")}.
- Twitter: max 280 chars, punchy, include relevant hashtag
- Bluesky: max 300 chars, conversational, no hashtags needed

Return JSON with: script, hook (first line only), cta (last line only), captions (Record<platform, string>), duration_estimate_seconds.
Return ONLY valid JSON.`;

  const userPrompt = `Write a viral ${duration} video script about: "${topic.topic}"

Category: ${topic.category}
Angle: ${topic.reasoning}`;

  const result = await generateAgentJSON<ScriptResponse>(
    "shorts_script_writer",
    systemPrompt,
    userPrompt,
    { maxTokens: 2000 },
  );

  return {
    script: result.script || "",
    hook: result.hook || result.script?.split("\n")[0] || "",
    cta: result.cta || "Follow for more.",
    captions: (result.captions || {}) as Record<PostingPlatform, string>,
    duration_estimate_seconds: result.duration_estimate_seconds || 30,
  };
}
