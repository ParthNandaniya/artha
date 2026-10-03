import { NextResponse } from "next/server";
import { UGC_VOICES } from "@/lib/ugc-shorts/voices";

export async function GET() {
  const voices = UGC_VOICES.map((v) => ({
    ...v,
    // Preview URL points to our API which generates TTS and caches in-memory
    previewUrl: `/api/tools/shorts/voices/preview?voiceId=${v.id}`,
  }));
  return NextResponse.json({ voices });
}
