import { NextResponse } from "next/server";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";

export const runtime = "nodejs";
export const maxDuration = 30;

interface ScriptResult {
  script: string;
  videoPrompt: string;
}

const SYSTEM_PROMPT = `You are a UGC (user-generated content) video script writer for short-form social media videos (TikTok, Reels, Shorts).

Given a user's idea or topic, generate TWO things:

1. **script** — A spoken script (what the avatar will say out loud). Rules:
   - 30-60 seconds when read aloud (roughly 80-160 words)
   - Start with a strong hook in the first sentence
   - Conversational, authentic tone — like talking to a friend
   - Include a clear call-to-action at the end
   - No stage directions, no emojis, no hashtags — just the spoken words

2. **videoPrompt** — A visual description for an AI video model that will animate a still portrait photo into a talking-head video. Rules:
   - Describe the person's movement, expressions, and energy (e.g. "talking directly to camera with animated hand gestures, excited facial expressions, nodding")
   - Include camera style (e.g. "handheld selfie-style", "close-up portrait")
   - Include setting/mood if relevant (e.g. "bright natural lighting, casual indoor setting")
   - Keep it under 200 characters
   - Do NOT describe the person's appearance (the model will use the avatar image)

Return valid JSON with keys: "script", "videoPrompt"`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prompt = body.prompt;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
      return NextResponse.json(
        { success: false, error: "Prompt must be at least 3 characters" },
        { status: 400 }
      );
    }

    if (prompt.length > 500) {
      return NextResponse.json(
        { success: false, error: "Prompt must be under 500 characters" },
        { status: 400 }
      );
    }

    const result = await generateAgentJSON<ScriptResult>(
      "ugc_script_writer",
      SYSTEM_PROMPT,
      prompt.trim(),
      { temperature: 0.8, maxTokens: 1024 }
    );

    return NextResponse.json({
      success: true,
      script: result.script,
      videoPrompt: result.videoPrompt,
    });
  } catch (error) {
    console.error("[ugc-shorts/script] generation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate script. Please try again." },
      { status: 500 }
    );
  }
}
