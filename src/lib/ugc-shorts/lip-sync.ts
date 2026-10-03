import Replicate from "replicate";
import { VIDEO_TOOL_CONFIG } from "@/config/video-tools";

let _client: Replicate | null = null;

function getClient(): Replicate {
  if (!_client) {
    const auth = process.env.REPLICATE_API_TOKEN;
    if (!auth) {
      throw new Error("REPLICATE_API_TOKEN is required");
    }
    _client = new Replicate({ auth });
  }
  return _client;
}

/**
 * Generate a video from an avatar image + text prompt using minimax/video-01-live.
 * Returns the output video URL.
 */
export async function generateVideo(
  imageUrl: string,
  prompt: string
): Promise<string> {
  const client = getClient();
  const model = VIDEO_TOOL_CONFIG.ugc_video_model;

  const output = await client.run(model, {
    input: {
      first_frame_image: imageUrl,
      prompt,
      prompt_optimizer: true,
    },
  });

  // Newer Replicate SDK returns FileOutput objects with .url() / .href
  // Older versions return plain strings or arrays of strings
  const raw = Array.isArray(output) ? output[0] : output;

  if (typeof raw === "string") {
    return raw;
  }

  if (raw && typeof raw === "object") {
    if ("href" in raw && typeof (raw as { href: string }).href === "string") {
      return (raw as { href: string }).href;
    }
    if ("url" in raw && typeof (raw as { url: () => URL }).url === "function") {
      return (raw as { url: () => URL }).url().href;
    }
    if ("url" in raw && typeof (raw as { url: string }).url === "string") {
      return (raw as { url: string }).url;
    }
  }

  throw new Error(`Unexpected video-01-live output format: ${typeof raw}`);
}
