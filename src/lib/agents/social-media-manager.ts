import type { AgentInput, AgentOutput } from "./types";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { runAgentic } from "./framework/agentic-runner";
import { validateOutput } from "./framework/validation";
import { getAgenticConfigForSource } from "@/config/agent-agentic-config";
import { getAgentModelConfig } from "@/config/agent-models";
import { PLATFORM_LIMITS, type SocialPlatform } from "@/lib/social-posting";

interface SocialPostDraft {
  platform: SocialPlatform;
  content: string;
  hashtags: string[];
  best_time: string; // ISO time or human-readable
  media_suggestion: string;
  engagement_hook: string;
}

interface SocialCalendarResponse {
  strategy: string;
  posts: SocialPostDraft[];
  summary: string;
  weeklyTheme: string;
}

type SocialSubtype = "calendar" | "single_post" | "repurpose";

function classifySocialType(prompt: string): SocialSubtype {
  const lower = prompt.toLowerCase();
  if (lower.includes("calendar") || lower.includes("schedule") || lower.includes("week") || lower.includes("plan")) return "calendar";
  if (lower.includes("repurpose") || lower.includes("cross-post") || lower.includes("adapt")) return "repurpose";
  return "single_post";
}

export async function runSocialMediaManagerAgent(input: AgentInput): Promise<AgentOutput> {
  try {
    const progress = input.onProgress || (() => {});
    const subtype = classifySocialType(input.prompt);

    switch (subtype) {
      case "calendar":
        return runCalendarGeneration(input);
      case "repurpose":
        return runContentRepurpose(input);
      default:
        return runSinglePostGeneration(input);
    }
  } catch (error) {
    return {
      success: false,
      agent: "social_media_manager",
      summary: "Social media content generation failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function runCalendarGeneration(input: AgentInput): Promise<AgentOutput> {
  const progress = input.onProgress || (() => {});
  const source = (input.metadata?.executionSource as "pipeline" | "chat") || "chat";
  const config = getAgenticConfigForSource("social_media_manager", source);
  const modelConfig = getAgentModelConfig("social_media_manager");

  progress("Creating social media content calendar...");

  const systemPrompt = `You are an elite social media strategist for early-stage startups. You create content calendars that build audience, drive engagement, and generate leads. You have access to web search and memory tools — use them to understand the company and its audience.

CONTENT STRATEGY:
- Each week has a theme aligned with the company's current goals (launch, growth, thought leadership, community)
- Mix content types: value posts (60%), engagement posts (20%), promotional posts (20%)
- Platform-specific optimization — what works on LinkedIn doesn't work on TikTok
- Build-in-public style resonates across all platforms for startups

PLATFORM RULES:
${Object.entries(PLATFORM_LIMITS).map(([p, l]) => `- ${p}: max ${l.maxChars} chars, ${l.maxHashtags} hashtags, ${l.supportsVideo ? "supports video" : "no video"}`).join("\n")}

POST QUALITY:
- Every post must have a hook in the first line that stops the scroll
- Use specific numbers, stories, and insights — not generic statements
- Hashtags: 3-5 relevant ones max, placed naturally or at the end
- Include suggested posting times based on platform best practices
- Each post must be different — no template repetition

Your final output MUST be JSON with:
- strategy: 1-2 sentences on the content approach and weekly theme
- weeklyTheme: the theme for this batch of content
- posts: array of { platform, content (within char limits), hashtags, best_time, media_suggestion, engagement_hook }
- summary: one-line summary of what was created

Return ONLY valid JSON — no markdown fences, no explanation outside the JSON.`;

  const runnerOutput = await runAgentic(
    {
      systemPrompt,
      userPrompt: input.prompt,
      context: input.context,
      agentInput: input,
      config,
      model: modelConfig.model,
      provider: modelConfig.provider,
    },
    (output, cfg) => validateOutput(output, cfg, input.prompt),
  );

  const result = runnerOutput.result;

  if (result.success && result.documents?.length) {
    const doc = result.documents[0];
    const parsed = doc.metadata as unknown as SocialCalendarResponse | undefined;
    if (parsed?.posts) {
      result.socialPosts = parsed.posts.map((p) => ({
        platform: p.platform,
        content: p.content,
        hashtags: p.hashtags,
        scheduled_at: p.best_time,
      }));
    }
    result.links = [{ label: "View calendar", url: "#social" }];
  }

  // Write to scratchpad
  if (input.scratchpad && result.socialPosts?.length) {
    input.scratchpad.write("social.postCount", result.socialPosts.length);
    input.scratchpad.write("social.platforms", [...new Set(result.socialPosts.map((p) => p.platform))]);
  }

  return result;
}

async function runSinglePostGeneration(input: AgentInput): Promise<AgentOutput> {
  const progress = input.onProgress || (() => {});
  progress("Crafting social media post...");

  const targetPlatforms = detectPlatforms(input.prompt);

  const result = await generateAgentJSON<{
    posts: { platform: string; content: string; hashtags: string[]; media_suggestion: string }[];
    summary: string;
  }>(
    "social_media_manager",
    `You are a social media content specialist for startups. Create platform-optimized posts.

Rules:
- Generate one post per target platform: ${targetPlatforms.join(", ")}
- Each post must be tailored to the platform's style, tone, and character limits
- Platform limits: ${targetPlatforms.map((p) => `${p}: ${PLATFORM_LIMITS[p]?.maxChars || 280} chars`).join(", ")}
- Hook in first line, specific value proposition, clear CTA
- No generic filler — every word earns its place
- Hashtags: platform-appropriate count and relevance

Return JSON with:
- posts: array of { platform, content, hashtags, media_suggestion }
- summary: what these posts are about

Company Context:
${input.context}`,
    input.prompt,
  );

  return {
    success: true,
    agent: "social_media_manager",
    summary: `Created ${result.posts.length} social post(s) — ${result.summary}`,
    socialPosts: result.posts.map((p) => ({
      platform: p.platform,
      content: p.content,
      hashtags: p.hashtags,
    })),
    links: [{ label: "View posts", url: "#social" }],
  };
}

async function runContentRepurpose(input: AgentInput): Promise<AgentOutput> {
  const progress = input.onProgress || (() => {});
  progress("Repurposing content across platforms...");

  const targetPlatforms: SocialPlatform[] = ["twitter", "linkedin", "instagram", "tiktok"];

  const result = await generateAgentJSON<{
    posts: { platform: string; content: string; hashtags: string[]; adaptation_notes: string }[];
    summary: string;
  }>(
    "social_media_manager",
    `You are an expert at repurposing content across social media platforms. Take the source content and adapt it for each platform.

Target platforms: ${targetPlatforms.join(", ")}

Rules:
- Each adaptation must feel NATIVE to the platform — not just a copy-paste with different length
- Twitter: punchy, opinionated, thread-worthy hooks
- LinkedIn: professional insight, personal story angle, longer form
- Instagram: visual-first caption, lifestyle angle, emoji-friendly
- TikTok: trending format, conversational, hook in first 2 seconds (write as video script)
- Respect character limits: ${targetPlatforms.map((p) => `${p}: ${PLATFORM_LIMITS[p]?.maxChars} chars`).join(", ")}

Return JSON with:
- posts: array of { platform, content, hashtags, adaptation_notes }
- summary: what was repurposed and key angle per platform

Company Context:
${input.context}`,
    input.prompt,
  );

  return {
    success: true,
    agent: "social_media_manager",
    summary: `Repurposed to ${result.posts.length} platforms — ${result.summary}`,
    socialPosts: result.posts.map((p) => ({
      platform: p.platform,
      content: p.content,
      hashtags: p.hashtags,
    })),
    links: [{ label: "View posts", url: "#social" }],
  };
}

function detectPlatforms(prompt: string): SocialPlatform[] {
  const lower = prompt.toLowerCase();
  const detected: SocialPlatform[] = [];

  if (lower.includes("twitter") || lower.includes(" x ") || lower.includes("tweet")) detected.push("twitter");
  if (lower.includes("linkedin")) detected.push("linkedin");
  if (lower.includes("instagram") || lower.includes("insta") || lower.includes("reel")) detected.push("instagram");
  if (lower.includes("tiktok") || lower.includes("tik tok")) detected.push("tiktok");
  if (lower.includes("youtube") || lower.includes("shorts")) detected.push("youtube");
  if (lower.includes("threads")) detected.push("threads");

  // Default to top 3 if none specified
  if (detected.length === 0) {
    return ["twitter", "linkedin", "instagram"];
  }

  return detected;
}
