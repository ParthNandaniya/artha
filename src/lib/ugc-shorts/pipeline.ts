import crypto from "crypto";
import { generateSpeech } from "./tts";
import { generateVideo } from "./lip-sync";
import { uploadToR2, getR2SignedUrl } from "@/lib/r2";
import { getDb } from "@/lib/neon";

export interface UgcJobInput {
  script: string;
  voiceId: string;
  avatarImageUrl: string;
  /** Visual description prompt for the video model (minimax). */
  videoPrompt: string;
  /** Skip TTS generation and use a previously cached audio key (dev mode). */
  skipTts?: boolean;
  /** Extra fields for DB tracking */
  ipAddress?: string;
  avatarId?: string;
  avatarType?: "preset" | "custom";
}

export interface UgcJobResult {
  id: string;
  videoUrl: string;
  audioUrl: string;
  durationSeconds: number;
}

/**
 * Rough estimate of audio duration from MP3 buffer size.
 * 128kbps MP3 = ~16KB per second.
 */
function estimateMp3Duration(buffer: Buffer): number {
  return buffer.length / (128 * 1024 / 8);
}

export async function runUgcPipeline(
  input: UgcJobInput
): Promise<UgcJobResult> {
  const db = getDb();
  const jobId = crypto.randomUUID();

  // Insert job row
  await db`
    INSERT INTO ugc_video_jobs (id, ip_address, script, voice_id, avatar_type, avatar_id, avatar_image_url, status)
    VALUES (${jobId}, ${input.ipAddress ?? null}, ${input.script}, ${input.voiceId},
            ${input.avatarType ?? "preset"}, ${input.avatarId ?? null}, ${input.avatarImageUrl}, 'tts')
  `;

  try {
    // 1. Generate speech (checks R2 cache first, skips ElevenLabs API if cached)
    let audioUrl: string;
    let audioKey: string;
    let durationSeconds: number;

    if (input.skipTts) {
      // Dev mode: use cached audio from a previous run to save ElevenLabs credits
      const cachedKey = await findCachedAudio(input.script, input.voiceId);
      if (cachedKey) {
        audioKey = cachedKey;
        audioUrl = await getR2SignedUrl(audioKey);
        durationSeconds = 6; // approximate for dev
      } else {
        // No cache available, fall through to normal TTS
        const tts = await generateSpeech(input.script, input.voiceId);
        audioKey = tts.r2Key;
        audioUrl = await getR2SignedUrl(audioKey);
        durationSeconds = Math.round(estimateMp3Duration(tts.audio) * 100) / 100;
      }
    } else {
      const tts = await generateSpeech(input.script, input.voiceId);
      audioKey = tts.r2Key;
      audioUrl = await getR2SignedUrl(audioKey);
      durationSeconds = Math.round(estimateMp3Duration(tts.audio) * 100) / 100;
    }

    await db`UPDATE ugc_video_jobs SET status = 'video_gen', tts_audio_key = ${audioKey}, updated_at = now() WHERE id = ${jobId}`;

    // 2. Generate video via minimax/video-01-live (image + text prompt)
    const replicateUrl = await generateVideo(input.avatarImageUrl, input.videoPrompt);

    await db`UPDATE ugc_video_jobs SET raw_video_url = ${replicateUrl}, updated_at = now() WHERE id = ${jobId}`;

    // 3. Download the video from Replicate and persist to R2
    const videoRes = await fetch(replicateUrl);
    if (!videoRes.ok) {
      throw new Error(`Failed to download video from Replicate: ${videoRes.status}`);
    }
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    const videoKey = `ugc-videos/${jobId}.mp4`;
    await uploadToR2({
      key: videoKey,
      body: videoBuffer,
      contentType: "video/mp4",
    });

    // 4. Mark done
    await db`
      UPDATE ugc_video_jobs
      SET status = 'done', final_video_key = ${videoKey}, duration_seconds = ${durationSeconds}, updated_at = now()
      WHERE id = ${jobId}
    `;

    // 5. Generate signed URLs (24h) for the client
    const videoUrl = await getR2SignedUrl(videoKey, 86400);

    return { id: jobId, videoUrl, audioUrl, durationSeconds };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db`UPDATE ugc_video_jobs SET status = 'failed', error = ${message}, updated_at = now() WHERE id = ${jobId}`.catch(() => {});
    throw err;
  }
}

/**
 * Look up a previously cached TTS audio in R2 by the same deterministic hash.
 * Returns the R2 key if found, null otherwise.
 */
async function findCachedAudio(script: string, voiceId: string): Promise<string | null> {
  const hash = crypto.createHash("sha256").update(`${voiceId}:${script}`).digest("hex").slice(0, 16);
  const key = `ugc-tts-cache/${hash}.mp3`;
  const { getFromR2 } = await import("@/lib/r2");
  const cached = await getFromR2(key);
  return cached ? key : null;
}
