/**
 * Shorts Pipeline Runner
 *
 * Full orchestration: discover → write → generate → approve → post
 */

import { getDb } from "@/lib/neon";
import { discoverTrendingTopics } from "./topic-discovery";
import { writeViralScript } from "./script-writer";
import { assembleVideo } from "./video-assembler";
import { postToAllPlatforms, recordPostResults } from "./poster";
import { autoApproveIfConfigured, getRecentTopics, getWeeklyVideoCount } from "./approval";
import type {
  ContentCategory,
  PipelineRunOptions,
  PostingPlatform,
  VideoShortStatus,
} from "./types";

function log(msg: string) {
  console.log(`[shorts-pipeline] ${msg}`);
}

const CONTENT_CATEGORIES: ContentCategory[] = ["ai_tips", "tech_trends", "build_in_public", "startup_advice"];

function pickCategory(index?: number): ContentCategory {
  const i = index ?? Math.floor(Math.random() * CONTENT_CATEGORIES.length);
  return CONTENT_CATEGORIES[i % CONTENT_CATEGORIES.length];
}

async function updateStatus(id: string, status: VideoShortStatus, extra?: Record<string, unknown>) {
  const db = getDb();
  if (extra && Object.keys(extra).length > 0) {
    // Build SET clause dynamically for extra fields
    const sets: string[] = [`status = '${status}'`, `updated_at = now()`];
    const values: unknown[] = [];
    for (const [key, val] of Object.entries(extra)) {
      if (val === null || val === undefined) continue;
      sets.push(`${key} = $${values.length + 2}`);
      values.push(val);
    }
    // Use raw query for dynamic columns
    await db`
      UPDATE video_shorts
      SET status = ${status}, updated_at = now(),
          script = ${(extra.script as string) || null},
          script_hook = ${(extra.script_hook as string) || null},
          script_cta = ${(extra.script_cta as string) || null},
          video_url = ${(extra.video_url as string) || null},
          thumbnail_url = ${(extra.thumbnail_url as string) || null},
          invideo_id = ${(extra.invideo_id as string) || null},
          metadata = ${JSON.stringify(extra.metadata || {})},
          error = ${(extra.error as string) || null}
      WHERE id = ${id}
    `;
  } else {
    await db`
      UPDATE video_shorts SET status = ${status}, updated_at = now() WHERE id = ${id}
    `;
  }
}

export interface CreateVideoResult {
  videoShortId: string;
  topic: string;
  category: ContentCategory;
  script: string;
  scriptHook: string;
  scriptCta: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
}

export interface PipelineResult {
  videoShortId: string;
  topic: string;
  category: ContentCategory;
  status: VideoShortStatus;
  postResults?: { platform: string; postUrl: string | null; status: string }[];
  error?: string;
}

/**
 * Create a video short (discover -> script -> generate) without posting.
 * Modular entry point for future site API use by founders.
 */
export async function createVideoShort(options: PipelineRunOptions = {}): Promise<CreateVideoResult> {
  const db = getDb();
  const projectId = options.projectId || null;
  const category = options.category || pickCategory();

  // Rate limit check
  const weeklyCount = await getWeeklyVideoCount(projectId);
  const maxPerWeek = 21;
  if (weeklyCount >= maxPerWeek) {
    throw new Error(`Weekly rate limit reached (${weeklyCount}/${maxPerWeek})`);
  }

  // Step 1: Discover trending topic
  log("Step 1: Discovering trending topics...");
  const recentTopics = await getRecentTopics(20);
  const topics = await discoverTrendingTopics({
    focus: category,
    count: 3,
    recentTopics,
  });

  if (topics.length === 0) {
    throw new Error("No trending topics found");
  }

  const topic = topics[0];
  log(`Topic selected: "${topic.topic}" (${topic.category}, score: ${topic.trendScore})`);

  // Create DB record
  const rows = await db`
    INSERT INTO video_shorts (topic, topic_source, topic_research, content_category, project_id, status, variant)
    VALUES (
      ${topic.topic},
      ${topic.source},
      ${JSON.stringify({ reasoning: topic.reasoning, researchData: topic.researchData })},
      ${topic.category || category},
      ${projectId},
      'topic_discovered',
      ${Math.random() > 0.5 ? "A" : "B"}
    )
    RETURNING id
  `;
  const videoShortId = rows[0].id as string;

  try {
    // Step 2: Write viral script
    log("Step 2: Writing viral script...");
    const platforms: PostingPlatform[] = options.platforms || ["twitter", "bluesky"];
    const script = await writeViralScript(topic, {
      voiceStyle: "energetic",
      duration: "short",
      platforms,
    });

    await updateStatus(videoShortId, "script_written", {
      script: script.script,
      script_hook: script.hook,
      script_cta: script.cta,
      metadata: { captions: script.captions, duration_estimate: script.duration_estimate_seconds },
    });
    log(`Script written: ${script.script.length} chars, ~${script.duration_estimate_seconds}s`);

    if (options.dryRun) {
      return {
        videoShortId,
        topic: topic.topic,
        category: topic.category || category,
        script: script.script,
        scriptHook: script.hook,
        scriptCta: script.cta,
        videoUrl: "",
        thumbnailUrl: null,
        durationSeconds: script.duration_estimate_seconds,
      };
    }

    // Step 3: Generate video via InVideo
    log("Step 3: Generating video...");
    await updateStatus(videoShortId, "generating");

    const video = await assembleVideo(script, {
      videoId: videoShortId,
      projectSlug: projectId || "artha",
      voiceStyle: "energetic",
      musicMood: "upbeat",
    });

    await updateStatus(videoShortId, "generated", {
      video_url: video.videoUrl,
      thumbnail_url: video.thumbnailUrl,
      invideo_id: video.invideoId,
    });
    log(`Video generated: ${video.r2Key} (${video.durationSeconds}s)`);

    return {
      videoShortId,
      topic: topic.topic,
      category: topic.category || category,
      script: script.script,
      scriptHook: script.hook,
      scriptCta: script.cta,
      videoUrl: video.r2Key,
      thumbnailUrl: video.thumbnailUrl,
      durationSeconds: video.durationSeconds,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateStatus(videoShortId, "failed", { error: msg });
    throw err;
  }
}

/**
 * Run the full shorts pipeline for one video.
 */
export async function runShortsPipeline(options: PipelineRunOptions = {}): Promise<PipelineResult> {
  const db = getDb();
  const projectId = options.projectId || null;
  const platforms: PostingPlatform[] = options.platforms || ["twitter", "bluesky"];
  const category = options.category || pickCategory();
  const autoApprove = options.autoApprove ?? (projectId === null); // auto-approve for Artha internal

  // Rate limit check
  const weeklyCount = await getWeeklyVideoCount(projectId);
  const maxPerWeek = 21; // 3 per day
  if (weeklyCount >= maxPerWeek) {
    log(`Rate limit reached: ${weeklyCount}/${maxPerWeek} videos this week`);
    return {
      videoShortId: "",
      topic: "",
      category,
      status: "failed",
      error: `Weekly rate limit reached (${weeklyCount}/${maxPerWeek})`,
    };
  }

  let videoShortId = "";

  try {
    // ── Step 1: Discover trending topic ──
    log("Step 1: Discovering trending topics...");
    const recentTopics = await getRecentTopics(20);
    const topics = await discoverTrendingTopics({
      focus: category,
      count: 3,
      recentTopics,
    });

    if (topics.length === 0) {
      throw new Error("No trending topics found");
    }

    const topic = topics[0];
    log(`Topic selected: "${topic.topic}" (${topic.category}, score: ${topic.trendScore})`);

    // Create DB record
    const rows = await db`
      INSERT INTO video_shorts (topic, topic_source, topic_research, content_category, project_id, status, variant)
      VALUES (
        ${topic.topic},
        ${topic.source},
        ${JSON.stringify({ reasoning: topic.reasoning, researchData: topic.researchData })},
        ${topic.category || category},
        ${projectId},
        'topic_discovered',
        ${Math.random() > 0.5 ? "A" : "B"}
      )
      RETURNING id
    `;
    videoShortId = rows[0].id as string;

    // ── Step 2: Write viral script ──
    log("Step 2: Writing viral script...");
    const script = await writeViralScript(topic, {
      voiceStyle: "energetic",
      duration: "short",
      platforms,
    });

    await updateStatus(videoShortId, "script_written", {
      script: script.script,
      script_hook: script.hook,
      script_cta: script.cta,
      metadata: { captions: script.captions, duration_estimate: script.duration_estimate_seconds },
    });
    log(`Script written: ${script.script.length} chars, ~${script.duration_estimate_seconds}s`);

    // ── Step 3: Generate video via InVideo ──
    log("Step 3: Generating video...");
    await updateStatus(videoShortId, "generating");

    const video = await assembleVideo(script, {
      videoId: videoShortId,
      projectSlug: projectId || "artha",
      voiceStyle: "energetic",
      musicMood: "upbeat",
    });

    await updateStatus(videoShortId, "generated", {
      video_url: video.videoUrl,
      thumbnail_url: video.thumbnailUrl,
      invideo_id: video.invideoId,
    });
    log(`Video generated: ${video.r2Key} (${video.durationSeconds}s)`);

    // ── Step 4: Approval ──
    log("Step 4: Approval check...");
    if (options.dryRun) {
      await updateStatus(videoShortId, "pending_approval");
      log("Dry run — skipping posting");
      return { videoShortId, topic: topic.topic, category: topic.category || category, status: "pending_approval" };
    }

    const wasAutoApproved = autoApprove
      ? (await autoApproveIfConfigured(videoShortId, projectId), true)
      : await autoApproveIfConfigured(videoShortId, projectId);

    if (!wasAutoApproved) {
      log("Queued for manual approval");
      return { videoShortId, topic: topic.topic, category: topic.category || category, status: "pending_approval" };
    }

    // ── Step 5: Post to platforms ──
    log("Step 5: Posting to platforms...");
    await updateStatus(videoShortId, "posting");

    const captions = (script.captions || {}) as Record<PostingPlatform, string>;
    // Fallback captions
    if (!captions.twitter) captions.twitter = `${script.hook}\n\n${script.cta}`;
    if (!captions.bluesky) captions.bluesky = `${script.hook}\n\n${script.cta}`;

    const postResults = await postToAllPlatforms(video.r2Key, captions, platforms);
    await recordPostResults(videoShortId, postResults);

    const anySuccess = postResults.some((r) => r.status === "posted");
    const finalStatus: VideoShortStatus = anySuccess ? "posted" : "failed";
    await updateStatus(videoShortId, finalStatus, {
      error: anySuccess ? null : postResults.map((r) => `${r.platform}: ${r.error}`).join("; "),
    });

    log(`Pipeline complete: ${finalStatus} — ${postResults.filter((r) => r.status === "posted").length}/${postResults.length} platforms`);

    return {
      videoShortId,
      topic: topic.topic,
      category: topic.category || category,
      status: finalStatus,
      postResults: postResults.map((r) => ({ platform: r.platform, postUrl: r.postUrl, status: r.status })),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Pipeline failed: ${msg}`);

    if (videoShortId) {
      await updateStatus(videoShortId, "failed", { error: msg });
    }

    return {
      videoShortId,
      topic: "",
      category,
      status: "failed",
      error: msg,
    };
  }
}

/**
 * Run pipeline for multiple videos (e.g., 2-3 per cron run).
 */
export async function runBatchPipeline(
  count: number,
  options: Omit<PipelineRunOptions, "category"> = {},
): Promise<PipelineResult[]> {
  const results: PipelineResult[] = [];

  for (let i = 0; i < count; i++) {
    const category = pickCategory(i + new Date().getDate()); // Rotate categories
    log(`\n── Batch ${i + 1}/${count} (${category}) ──`);

    const result = await runShortsPipeline({ ...options, category });
    results.push(result);

    // Small delay between runs to avoid rate limits
    if (i < count - 1) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }

  return results;
}
