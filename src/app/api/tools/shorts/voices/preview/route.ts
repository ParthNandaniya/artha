import { NextRequest, NextResponse } from "next/server";
import { UGC_VOICES } from "@/lib/ugc-shorts/voices";
import { generateSpeech } from "@/lib/ugc-shorts/tts";
import { uploadToR2, getFromR2 } from "@/lib/r2";

// In-memory cache for the current instance (fast path)
const memCache = new Map<string, Buffer>();

const R2_PREFIX = "voice-previews/";

export async function GET(request: NextRequest) {
  const voiceId = request.nextUrl.searchParams.get("voiceId");
  if (!voiceId) {
    return NextResponse.json({ error: "voiceId is required" }, { status: 400 });
  }

  const voice = UGC_VOICES.find((v) => v.id === voiceId);
  if (!voice) {
    return NextResponse.json({ error: "Voice not found" }, { status: 404 });
  }

  // 1. Check in-memory cache (fastest)
  let audio = memCache.get(voiceId);
  if (audio) {
    return serveAudio(audio);
  }

  // 2. Check R2 persistent cache
  try {
    const r2File = await getFromR2(`${R2_PREFIX}${voiceId}.mp3`);
    if (r2File) {
      memCache.set(voiceId, r2File.body);
      return serveAudio(r2File.body);
    }
  } catch (err) {
    console.error("[voice-preview] R2 read failed for:", voiceId, err);
    // Fall through to generate
  }

  // 3. Generate via ElevenLabs, cache to both R2 and memory
  try {
    const result = await generateSpeech(voice.previewText, voice.voiceId);
    audio = result.audio;
    memCache.set(voiceId, audio);

    // Persist to R2 in background (don't block response)
    uploadToR2({
      key: `${R2_PREFIX}${voiceId}.mp3`,
      body: audio,
      contentType: "audio/mpeg",
    }).catch((err) => console.error("[voice-preview] R2 upload failed for:", voiceId, err));

    return serveAudio(audio);
  } catch (err) {
    console.error("[voice-preview] TTS failed for:", voiceId, err);
    return NextResponse.json(
      { error: "Failed to generate preview" },
      { status: 500 }
    );
  }
}

function serveAudio(audio: Buffer) {
  return new NextResponse(new Uint8Array(audio).buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=604800, immutable",
    },
  });
}
