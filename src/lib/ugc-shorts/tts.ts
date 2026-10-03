import crypto from "crypto";
import { ElevenLabsClient } from "elevenlabs";
import { getFromR2, uploadToR2 } from "@/lib/r2";
import { VIDEO_TOOL_CONFIG } from "@/config/video-tools";
const R2_PREFIX = "ugc-tts-cache/";

let _client: ElevenLabsClient | null = null;

function getClient(): ElevenLabsClient {
  if (!_client) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY is required");
    }
    _client = new ElevenLabsClient({ apiKey });
  }
  return _client;
}

/** Deterministic cache key from script text + voice ID */
function cacheKey(text: string, voiceId: string): string {
  const hash = crypto.createHash("sha256").update(`${voiceId}:${text}`).digest("hex").slice(0, 16);
  return `${R2_PREFIX}${hash}.mp3`;
}

export async function generateSpeech(
  text: string,
  voiceId: string
): Promise<{ audio: Buffer; r2Key: string; cached: boolean }> {
  const key = cacheKey(text, voiceId);

  // 1. Check R2 cache first
  const cached = await getFromR2(key);
  if (cached) {
    return { audio: cached.body, r2Key: key, cached: true };
  }

  // 2. Cache miss — call ElevenLabs
  const client = getClient();

  const audioStream = await client.textToSpeech.convert(voiceId, {
    text,
    model_id: VIDEO_TOOL_CONFIG.ugc_tts_model,
    output_format: "mp3_44100_128",
  });

  const chunks: Buffer[] = [];
  for await (const chunk of audioStream) {
    chunks.push(Buffer.from(chunk));
  }
  const audio = Buffer.concat(chunks);

  // 3. Persist to R2 for future reuse
  await uploadToR2({ key, body: audio, contentType: "audio/mpeg" });

  return { audio, r2Key: key, cached: false };
}
