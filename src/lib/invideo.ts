/**
 * InVideo AI API Client
 *
 * Programmatic video generation — generates short-form videos from text prompts
 * including script, voiceover, footage selection, captions, and music.
 *
 * Env vars:
 *   INVIDEO_API_KEY   — InVideo AI API key
 *   INVIDEO_BASE_URL  — Base URL (default: https://api.invideo.io/v2)
 */

export type VideoType = "launch_announcement" | "product_explainer" | "social_clip";
export type VideoPlatform = "tiktok" | "instagram_reels" | "youtube_shorts" | "linkedin" | "twitter" | "general";
export type VideoStatus = "queued" | "processing" | "ready" | "failed";

export interface VideoGenerationRequest {
  prompt: string;
  type: VideoType;
  platform: VideoPlatform;
  duration?: "short" | "medium" | "long"; // 5-15s | 15-30s | 30-60s
  brandName?: string;
  brandColors?: string[];
  websiteUrl?: string;
  voiceStyle?: "professional" | "casual" | "energetic" | "calm";
  musicMood?: "upbeat" | "corporate" | "inspiring" | "minimal";
}

export interface VideoGenerationResponse {
  id: string;
  status: VideoStatus;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  scriptText: string | null;
  estimatedCompletionSeconds: number | null;
}

export interface VideoStatusResponse {
  id: string;
  status: VideoStatus;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  scriptText: string | null;
  error: string | null;
}

interface InVideoConfig {
  apiKey: string;
  baseUrl: string;
}

function getConfig(): InVideoConfig {
  const apiKey = process.env.INVIDEO_API_KEY;
  if (!apiKey) {
    throw new Error("INVIDEO_API_KEY is not configured");
  }
  return {
    apiKey,
    baseUrl: process.env.INVIDEO_BASE_URL || "https://api.invideo.io/v2",
  };
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const config = getConfig();
  const url = `${config.baseUrl}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error");
    throw new Error(`InVideo API error ${response.status}: ${errorBody}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Map platform to InVideo's aspect ratio format.
 */
function getAspectRatio(platform: VideoPlatform): string {
  switch (platform) {
    case "tiktok":
    case "instagram_reels":
    case "youtube_shorts":
      return "9:16"; // Vertical
    case "linkedin":
    case "twitter":
    case "general":
    default:
      return "16:9"; // Horizontal
  }
}

/**
 * Map duration preset to seconds range.
 */
function getDurationRange(duration: "short" | "medium" | "long"): { min: number; max: number } {
  switch (duration) {
    case "short":
      return { min: 5, max: 15 };
    case "medium":
      return { min: 15, max: 30 };
    case "long":
      return { min: 30, max: 60 };
  }
}

/**
 * Generate a video from a text prompt.
 */
export async function generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
  const durationRange = getDurationRange(request.duration || "medium");

  return apiRequest<VideoGenerationResponse>("/videos/generate", {
    method: "POST",
    body: JSON.stringify({
      prompt: request.prompt,
      aspect_ratio: getAspectRatio(request.platform),
      min_duration: durationRange.min,
      max_duration: durationRange.max,
      brand_name: request.brandName,
      brand_colors: request.brandColors,
      website_url: request.websiteUrl,
      voice_style: request.voiceStyle || "professional",
      music_mood: request.musicMood || "upbeat",
      auto_captions: true,
      quality: "high",
    }),
  });
}

/**
 * Check the status of a video generation job.
 */
export async function getVideoStatus(videoId: string): Promise<VideoStatusResponse> {
  return apiRequest<VideoStatusResponse>(`/videos/${videoId}`);
}

/**
 * Poll for video completion with timeout.
 */
export async function waitForVideo(
  videoId: string,
  opts: { maxWaitMs?: number; pollIntervalMs?: number } = {},
): Promise<VideoStatusResponse> {
  const maxWait = opts.maxWaitMs || 300_000; // 5 minutes
  const pollInterval = opts.pollIntervalMs || 10_000; // 10 seconds
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const status = await getVideoStatus(videoId);
    if (status.status === "ready" || status.status === "failed") {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Video generation timed out after ${maxWait / 1000}s`);
}

/**
 * Delete a generated video.
 */
export async function deleteVideo(videoId: string): Promise<void> {
  await apiRequest(`/videos/${videoId}`, { method: "DELETE" });
}

/**
 * Check if InVideo API is configured.
 */
export function isInVideoConfigured(): boolean {
  return !!process.env.INVIDEO_API_KEY;
}

/**
 * Build a video generation prompt from company context.
 */
export function buildVideoPrompt(
  type: VideoType,
  company: { name: string; tagline: string; description: string; websiteUrl: string; targetAudience?: string },
): string {
  switch (type) {
    case "launch_announcement":
      return `Create a launch announcement video for ${company.name}. Tagline: "${company.tagline}". ${company.description}. The video should build excitement, show the product value, and end with a call-to-action directing viewers to ${company.websiteUrl}. Target audience: ${company.targetAudience || "entrepreneurs and small business owners"}.`;

    case "product_explainer":
      return `Create a product explainer video for ${company.name}. ${company.description}. Walk viewers through the key benefits and how it works. End with a clear call-to-action to visit ${company.websiteUrl}. Keep it concise and visually engaging.`;

    case "social_clip":
      return `Create a short, attention-grabbing social media clip for ${company.name} — "${company.tagline}". The clip should hook viewers in the first 2 seconds, deliver one key benefit, and include a subtle call-to-action. Make it feel native to social media, not like an ad.`;
  }
}
