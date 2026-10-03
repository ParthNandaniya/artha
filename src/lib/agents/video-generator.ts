import type { AgentInput, AgentOutput } from "./types";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { runAgentic } from "./framework/agentic-runner";
import { validateOutput } from "./framework/validation";
import { getAgenticConfigForSource } from "@/config/agent-agentic-config";
import { getAgentModelConfig } from "@/config/agent-models";
import {
  generateVideo,
  waitForVideo,
  buildVideoPrompt,
  isInVideoConfigured,
  type VideoType,
  type VideoPlatform,
} from "@/lib/invideo";

interface VideoSpec {
  type: VideoType;
  platform: VideoPlatform;
  title: string;
  description: string;
  script: string;
  duration: "short" | "medium" | "long";
  voiceStyle: "professional" | "casual" | "energetic" | "calm";
  musicMood: "upbeat" | "corporate" | "inspiring" | "minimal";
  captions: Record<string, string>; // platform -> suggested caption
}

interface VideoGenerationPlan {
  videos: VideoSpec[];
  strategy: string;
  summary: string;
}

export async function runVideoGeneratorAgent(input: AgentInput): Promise<AgentOutput> {
  try {
    const progress = input.onProgress || (() => {});
    const source = (input.metadata?.executionSource as "pipeline" | "chat") || "chat";
    const config = getAgenticConfigForSource("video_generator", source);
    const modelConfig = getAgentModelConfig("video_generator");

    progress("Planning video content...");

    // Step 1: AI plans the video(s) — what to make, for which platform, with what script
    const systemPrompt = `You are a video content strategist for startups. You plan short-form video content that drives engagement and conversions.

VIDEO TYPES:
- launch_announcement (15-30s): Build excitement about a new product/company. Hook → value prop → CTA.
- product_explainer (30-60s): Walk through key benefits and how it works. Problem → solution → proof → CTA.
- social_clip (5-15s): Quick, attention-grabbing clip for social feeds. Hook → one key benefit → subtle CTA.

PLATFORM OPTIMIZATION:
- tiktok / instagram_reels / youtube_shorts: 9:16 vertical, fast-paced, trending format, hook in first 2 seconds
- linkedin: 16:9 horizontal, professional tone, thought-leadership angle
- twitter: 16:9, concise, punchy, conversation-starting
- general: 16:9, versatile, works everywhere

SCRIPT RULES:
- Every script starts with a scroll-stopping hook (question, bold claim, surprising stat)
- Keep language conversational — not corporate
- Include natural pauses for visual transitions
- End with a specific CTA (visit website, follow, try free)
- Scripts should be speakable — read them out loud in your mind

You have access to memory tools — use query_memory to understand the company context, product, and target audience.

Your final output MUST be JSON with:
- strategy: 1-2 sentences on the video content approach
- videos: array of { type, platform, title, description, script, duration ("short"|"medium"|"long"), voiceStyle, musicMood, captions: { platform_name: "suggested caption for posting" } }
- summary: one-line summary

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

    if (!result.success) return result;

    // Extract video specs from the agent output
    const videoPlan = extractVideoPlan(result);
    if (!videoPlan || videoPlan.videos.length === 0) {
      return {
        ...result,
        summary: result.summary || "Video plan created but no video specs were generated",
      };
    }

    // Step 2: If InVideo is configured, actually generate the videos
    if (isInVideoConfigured()) {
      progress(`Generating ${videoPlan.videos.length} video(s) via InVideo AI...`);

      const videoResults = await Promise.allSettled(
        videoPlan.videos.map(async (spec) => {
          const company = extractCompanyInfo(input.context);
          const prompt = spec.script || buildVideoPrompt(spec.type, company);

          const generation = await generateVideo({
            prompt,
            type: spec.type,
            platform: spec.platform,
            duration: spec.duration,
            brandName: company.name,
            websiteUrl: company.websiteUrl,
            voiceStyle: spec.voiceStyle,
            musicMood: spec.musicMood,
          });

          progress(`Video "${spec.title}" queued — waiting for generation...`);
          const completed = await waitForVideo(generation.id, { maxWaitMs: 180_000 });

          return {
            type: spec.type,
            title: spec.title,
            description: spec.description,
            platform: spec.platform,
            url: completed.videoUrl,
            thumbnail_url: completed.thumbnailUrl,
            captions: spec.captions,
          };
        }),
      );

      const successfulVideos = videoResults
        .filter((r): r is PromiseFulfilledResult<typeof videoResults[number] extends PromiseSettledResult<infer T> ? T : never> => r.status === "fulfilled")
        .map((r) => {
          const v = r.value as { type: string; title: string; description: string; platform: string; url: string | null; thumbnail_url: string | null; captions: Record<string, string> };
          return { ...v, url: v.url ?? undefined, thumbnail_url: v.thumbnail_url ?? undefined };
        });

      const failedCount = videoResults.filter((r) => r.status === "rejected").length;

      result.videos = successfulVideos;
      result.summary = `Generated ${successfulVideos.length} video(s)${failedCount > 0 ? ` (${failedCount} failed)` : ""} — ${videoPlan.strategy}`;
    } else {
      // InVideo not configured — return the plan/scripts only
      result.videos = videoPlan.videos.map((spec) => ({
        type: spec.type,
        title: spec.title,
        description: spec.description,
        platform: spec.platform,
        captions: spec.captions,
      }));
      result.summary = `Video plan created (${videoPlan.videos.length} videos) — InVideo API not configured, returning scripts only. ${videoPlan.strategy}`;
    }

    result.links = [{ label: "View videos", url: "#videos" }];

    // Write to scratchpad for downstream agents
    if (input.scratchpad && result.videos?.length) {
      input.scratchpad.write("video.count", result.videos.length);
      input.scratchpad.write("video.platforms", result.videos.map((v) => v.platform));
      input.scratchpad.write("video.titles", result.videos.map((v) => v.title));
    }

    return result;
  } catch (error) {
    return {
      success: false,
      agent: "video_generator",
      summary: "Video generation failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function extractVideoPlan(result: AgentOutput): VideoGenerationPlan | null {
  if (!result.documents?.length) return null;

  const doc = result.documents[0];
  const meta = doc.metadata as Record<string, unknown> | undefined;

  if (meta?.videos && Array.isArray(meta.videos)) {
    return {
      videos: meta.videos as VideoSpec[],
      strategy: (meta.strategy as string) || "",
      summary: (meta.summary as string) || result.summary,
    };
  }

  // Try parsing the document content as JSON
  try {
    const parsed = JSON.parse(doc.content);
    if (parsed.videos && Array.isArray(parsed.videos)) {
      return parsed as VideoGenerationPlan;
    }
  } catch {
    // Not JSON — that's fine
  }

  return null;
}

function extractCompanyInfo(context: string): {
  name: string;
  tagline: string;
  description: string;
  websiteUrl: string;
  targetAudience?: string;
} {
  // Parse company info from the context string
  const nameMatch = context.match(/Company:\s*(.+)/i) || context.match(/Name:\s*(.+)/i);
  const taglineMatch = context.match(/Tagline:\s*(.+)/i);
  const urlMatch = context.match(/(?:Website|URL|Site):\s*(https?:\/\/\S+|\S+\.tryartha\.com)/i);

  return {
    name: nameMatch?.[1]?.trim() || "the company",
    tagline: taglineMatch?.[1]?.trim() || "",
    description: context.slice(0, 500),
    websiteUrl: urlMatch?.[1]?.trim() || "",
  };
}
