/**
 * Multi-Platform Poster
 *
 * Posts video shorts to Twitter and Bluesky using existing integrations.
 */

import { postTweetWithVideo, isTwitterPlatformAccountConfigured } from "@/lib/twitter";
import { postToBlueskyWithVideo, isBlueskyConfigured } from "@/lib/growth/bluesky";
import { getFromR2 } from "@/lib/r2";
import { getDb } from "@/lib/neon";
import type { PostingPlatform, PostResult } from "./types";

function log(msg: string) {
  console.log(`[shorts-poster] ${msg}`);
}

async function getVideoBuffer(r2Key: string): Promise<Buffer> {
  const file = await getFromR2(r2Key);
  if (!file) throw new Error(`Video not found in R2: ${r2Key}`);
  return file.body;
}

async function postToTwitter(videoBuffer: Buffer, caption: string): Promise<PostResult> {
  try {
    if (!isTwitterPlatformAccountConfigured()) {
      return { platform: "twitter", postUrl: null, externalPostId: null, status: "failed", error: "Twitter not configured" };
    }

    const result = await postTweetWithVideo({ text: caption, videoBuffer });
    log(`Posted to Twitter: ${result.tweetUrl}`);
    return {
      platform: "twitter",
      postUrl: result.tweetUrl,
      externalPostId: result.tweetId,
      status: "posted",
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Twitter post failed: ${msg}`);
    return { platform: "twitter", postUrl: null, externalPostId: null, status: "failed", error: msg };
  }
}

async function postToBluesky(videoBuffer: Buffer, caption: string): Promise<PostResult> {
  try {
    if (!isBlueskyConfigured()) {
      return { platform: "bluesky", postUrl: null, externalPostId: null, status: "failed", error: "Bluesky not configured" };
    }

    const result = await postToBlueskyWithVideo({
      text: caption,
      videoBuffer,
      alt: "Short-form video by Artha",
    });
    log(`Posted to Bluesky: ${result.postUrl}`);
    return {
      platform: "bluesky",
      postUrl: result.postUrl,
      externalPostId: result.uri,
      status: "posted",
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Bluesky post failed: ${msg}`);
    return { platform: "bluesky", postUrl: null, externalPostId: null, status: "failed", error: msg };
  }
}

/**
 * Post a video to all configured platforms.
 */
export async function postToAllPlatforms(
  videoR2Key: string,
  captions: Record<PostingPlatform, string>,
  platforms: PostingPlatform[],
): Promise<PostResult[]> {
  const videoBuffer = await getVideoBuffer(videoR2Key);
  const results: PostResult[] = [];

  const tasks: Promise<PostResult>[] = [];

  if (platforms.includes("twitter")) {
    tasks.push(postToTwitter(videoBuffer, captions.twitter || captions.bluesky || ""));
  }
  if (platforms.includes("bluesky")) {
    tasks.push(postToBluesky(videoBuffer, captions.bluesky || captions.twitter || ""));
  }

  const settled = await Promise.allSettled(tasks);
  for (const result of settled) {
    if (result.status === "fulfilled") {
      results.push(result.value);
    } else {
      log(`Platform posting rejected: ${result.reason}`);
    }
  }

  return results;
}

/**
 * Record posting results in the database.
 */
export async function recordPostResults(
  videoShortId: string,
  results: PostResult[],
): Promise<void> {
  const db = getDb();

  for (const r of results) {
    await db`
      INSERT INTO video_shorts_posts (video_short_id, platform, external_post_id, post_url, caption, status, error, posted_at)
      VALUES (
        ${videoShortId},
        ${r.platform},
        ${r.externalPostId},
        ${r.postUrl},
        ${""},
        ${r.status},
        ${r.error},
        ${r.status === "posted" ? new Date().toISOString() : null}
      )
    `;
  }
}
