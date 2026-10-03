/**
 * Video Assembler
 *
 * Generates video via InVideo API, downloads the result, and stores in R2.
 */

import {
  generateVideo,
  waitForVideo,
  isInVideoConfigured,
  type VideoGenerationRequest,
} from "@/lib/invideo";
import { uploadToR2 } from "@/lib/r2";
import type { AssembledVideo, VideoScript } from "./types";

function log(msg: string) {
  console.log(`[shorts-assembler] ${msg}`);
}

export async function assembleVideo(
  script: VideoScript,
  options: {
    videoId: string;
    projectSlug?: string;
    voiceStyle?: "professional" | "casual" | "energetic" | "calm";
    musicMood?: "upbeat" | "corporate" | "inspiring" | "minimal";
  },
): Promise<AssembledVideo> {
  if (!isInVideoConfigured()) {
    throw new Error("INVIDEO_API_KEY is not configured — cannot generate video");
  }

  const slug = options.projectSlug || "artha";

  log(`Generating video for: "${script.hook}"`);

  // Build the InVideo prompt from script
  const prompt = `Create a short-form vertical video with voiceover narration.

SCRIPT TO NARRATE:
${script.script}

STYLE:
- Vertical 9:16 format (for TikTok/Reels/Shorts)
- ${options.voiceStyle || "energetic"} voice style
- ${options.musicMood || "upbeat"} background music
- Auto-generate captions/subtitles
- Use engaging stock footage / motion graphics that match the narration
- Fast-paced cuts — no clip longer than 3 seconds
- Hook viewer in first 2 seconds`;

  const request: VideoGenerationRequest = {
    prompt,
    type: "social_clip",
    platform: "youtube_shorts",
    duration: script.duration_estimate_seconds <= 20 ? "short" : "medium",
    brandName: "Artha",
    brandColors: ["#f97316", "#1e293b"],
    websiteUrl: "https://artha.run",
    voiceStyle: options.voiceStyle || "energetic",
    musicMood: options.musicMood || "upbeat",
  };

  // Generate and wait for completion
  const generation = await generateVideo(request);
  log(`InVideo job started: ${generation.id}`);

  const completed = await waitForVideo(generation.id, {
    maxWaitMs: 300_000, // 5 min timeout
    pollIntervalMs: 15_000,
  });

  if (completed.status === "failed") {
    throw new Error(`InVideo generation failed: ${completed.error || "unknown error"}`);
  }

  if (!completed.videoUrl) {
    throw new Error("InVideo returned ready status but no videoUrl");
  }

  // Download the video from InVideo
  log("Downloading generated video...");
  const videoRes = await fetch(completed.videoUrl);
  if (!videoRes.ok) {
    throw new Error(`Failed to download video: ${videoRes.status}`);
  }
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

  // Upload to R2
  const r2Key = `shorts/${slug}/${options.videoId}.mp4`;
  await uploadToR2({
    key: r2Key,
    body: videoBuffer,
    contentType: "video/mp4",
  });
  log(`Video stored in R2: ${r2Key}`);

  // Upload thumbnail if available
  let thumbnailUrl: string | null = null;
  if (completed.thumbnailUrl) {
    try {
      const thumbRes = await fetch(completed.thumbnailUrl);
      if (thumbRes.ok) {
        const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer());
        const thumbKey = `shorts/${slug}/${options.videoId}-thumb.jpg`;
        await uploadToR2({
          key: thumbKey,
          body: thumbBuffer,
          contentType: "image/jpeg",
        });
        thumbnailUrl = thumbKey;
      }
    } catch {
      log("Thumbnail download failed, skipping");
    }
  }

  return {
    videoUrl: r2Key,
    thumbnailUrl,
    durationSeconds: completed.durationSeconds,
    invideoId: generation.id,
    r2Key,
  };
}
