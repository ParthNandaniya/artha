import { NextResponse } from "next/server";
import { checkFreeToolLimit } from "@/lib/free-tools";
import { getClientIp } from "@/lib/site-api";
import { runUgcPipeline } from "@/lib/ugc-shorts/pipeline";
import { UGC_VOICES } from "@/lib/ugc-shorts/voices";
import { UGC_AVATARS } from "@/lib/ugc-shorts/avatars";
import { uploadToR2, getR2SignedUrl } from "@/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes - video generation takes time

export async function POST(request: Request) {
  try {
    const limitResponse = checkFreeToolLimit("shorts", request);
    if (limitResponse) return limitResponse;

    const contentType = request.headers.get("content-type") ?? "";
    let script: string;
    let voiceId: string;
    let avatarId: string | undefined;
    let avatarImageUrl: string;
    let avatarType: "preset" | "custom" = "preset";
    let videoPrompt: string;
    let skipTts = false;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      script = formData.get("script") as string;
      voiceId = formData.get("voiceId") as string;
      avatarId = (formData.get("avatarId") as string) || undefined;
      videoPrompt = (formData.get("videoPrompt") as string) || "";
      skipTts = formData.get("skipTts") === "true";
      const avatarFile = formData.get("avatarFile") as File | null;

      if (avatarFile && avatarFile.size > 0) {
        avatarType = "custom";
        const ext = avatarFile.name.split(".").pop() || "png";
        const key = `ugc-temp/face-${crypto.randomUUID()}.${ext}`;
        const buffer = Buffer.from(await avatarFile.arrayBuffer());
        await uploadToR2({ key, body: buffer, contentType: avatarFile.type });
        avatarImageUrl = await getR2SignedUrl(key);
      } else {
        const avatar = UGC_AVATARS.find((a) => a.id === avatarId);
        if (!avatar) {
          return NextResponse.json(
            { success: false, error: "Invalid avatar selected" },
            { status: 400 }
          );
        }
        avatarImageUrl = await getR2SignedUrl(avatar.r2Key);
      }
    } else {
      const body = await request.json();
      script = body.script;
      voiceId = body.voiceId;
      avatarId = body.avatarId;
      videoPrompt = body.videoPrompt || "";
      skipTts = body.skipTts === true;

      if (body.customAvatarUrl) {
        avatarImageUrl = body.customAvatarUrl;
      } else {
        const avatar = UGC_AVATARS.find((a) => a.id === avatarId);
        if (!avatar) {
          return NextResponse.json(
            { success: false, error: "Invalid avatar selected" },
            { status: 400 }
          );
        }
        avatarImageUrl = await getR2SignedUrl(avatar.r2Key);
      }
    }

    // Validate script
    if (!script || typeof script !== "string" || script.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: "Script must be at least 10 characters" },
        { status: 400 }
      );
    }

    if (script.length > 1000) {
      return NextResponse.json(
        { success: false, error: "Script must be under 1000 characters" },
        { status: 400 }
      );
    }

    // Validate videoPrompt
    if (!videoPrompt || videoPrompt.trim().length < 5) {
      return NextResponse.json(
        { success: false, error: "Video prompt is required" },
        { status: 400 }
      );
    }

    // Validate voice
    const voice = UGC_VOICES.find((v) => v.id === voiceId);
    if (!voice) {
      return NextResponse.json(
        { success: false, error: "Invalid voice selected" },
        { status: 400 }
      );
    }

    // Run pipeline
    const result = await runUgcPipeline({
      script: script.trim(),
      voiceId: voice.voiceId,
      avatarImageUrl,
      videoPrompt: videoPrompt.trim(),
      skipTts,
      ipAddress: getClientIp(request),
      avatarId,
      avatarType,
    });

    return NextResponse.json({
      success: true,
      id: result.id,
      videoUrl: result.videoUrl,
      audioUrl: result.audioUrl,
      durationSeconds: result.durationSeconds,
    });
  } catch (error) {
    console.error("[ugc-shorts] generation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate video. Please try again." },
      { status: 500 }
    );
  }
}
