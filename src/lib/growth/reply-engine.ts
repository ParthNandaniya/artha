import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import {
  fetchRepliesToTweet,
  fetchMentions,
  replyToTweet,
  type TweetReply,
} from "@/lib/twitter";
import {
  fetchRepliesToBlueskyPost,
  replyToBlueskyPost,
  getBlueskyPostCid,
  isBlueskyConfigured,
  type BlueskyReply,
} from "./bluesky";
import {
  getRecentBotTweetIds,
  getRecentBotBlueskyUris,
  getTodayReplyCount,
  getProcessedReplyIds,
  recordReplyDecision,
} from "./scheduler";

// ── Constants ────────────────────────────────────────────────────────

const MAX_DAILY_REPLIES = 15;
const TWEET_MAX = 280;
const BSKY_MAX = 300;

// Only run during PST daytime hours (8 AM - 9 PM)
const REPLY_WINDOW_START = 8;  // 8 AM PST
const REPLY_WINDOW_END = 21;   // 9 PM PST

function log(msg: string) {
  const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
  console.log(`[reply-engine ${ts}] ${msg}`);
}

function getPSTHour(): number {
  const nowStr = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
  return new Date(nowStr).getHours();
}

function isWithinReplyWindow(): boolean {
  const hour = getPSTHour();
  return hour >= REPLY_WINDOW_START && hour < REPLY_WINDOW_END;
}

// ── Types ────────────────────────────────────────────────────────────

interface IncomingReply extends TweetReply {
  sourceTweetId: string;
  sourcePostId: string | null;
  sourceContent: string;
  platform: "twitter" | "bluesky";
  // Bluesky-specific fields (only set when platform === "bluesky")
  blueskyParentUri?: string;
  blueskyParentCid?: string;
  blueskyRootUri?: string;
}

interface ReplyEngineResult {
  processed: number;
  replied: number;
  skipped: number;
  errors: number;
  replies: Array<{
    to: string; // @username
    decision: "reply" | "skip";
    reason: string;
    responseUrl?: string;
  }>;
}

// ── Fetch new (unprocessed) replies ──────────────────────────────────

async function fetchNewReplies(
  platform: "twitter" | "bluesky" | "all" = "all"
): Promise<IncomingReply[]> {
  const allReplies: IncomingReply[] = [];

  // ── Twitter replies ────────────────────────────────────────────────
  if (platform === "twitter" || platform === "all") {
    const recentPosts = await getRecentBotTweetIds(1);
    log(`Checking replies on ${recentPosts.length} recent tweets (last 24h)`);

    for (const post of recentPosts) {
      try {
        const replies = await fetchRepliesToTweet(post.tweetId);
        for (const reply of replies) {
          allReplies.push({
            ...reply,
            sourceTweetId: post.tweetId,
            sourcePostId: post.postId,
            sourceContent: post.content,
            platform: "twitter",
          });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log(`WARN: Failed to fetch Twitter replies for ${post.tweetId}: ${msg}`);
      }
    }
  }

  // ── Bluesky replies ────────────────────────────────────────────────
  if ((platform === "bluesky" || platform === "all") && isBlueskyConfigured()) {
    const recentBlueskyPosts = await getRecentBotBlueskyUris(1);
    log(`Checking replies on ${recentBlueskyPosts.length} recent Bluesky posts (last 24h)`);

    for (const post of recentBlueskyPosts) {
      try {
        const replies = await fetchRepliesToBlueskyPost(post.uri);
        for (const reply of replies) {
          // Get the CID for the reply's parent (our original post) — needed for replying
          let parentCid: string | undefined;
          try {
            parentCid = await getBlueskyPostCid(post.uri);
          } catch {
            // If we can't get CID, we can still evaluate but can't reply
          }

          allReplies.push({
            id: reply.id,
            text: reply.text,
            authorId: reply.authorId,
            authorUsername: reply.authorUsername,
            authorVerified: reply.authorVerified,
            createdAt: reply.createdAt,
            sourceTweetId: post.uri, // Use URI as the "tweet ID" for Bluesky
            sourcePostId: post.postId,
            sourceContent: post.content,
            platform: "bluesky",
            blueskyParentUri: reply.id,
            blueskyParentCid: parentCid,
            blueskyRootUri: post.uri,
          });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log(`WARN: Failed to fetch Bluesky replies for ${post.uri}: ${msg}`);
      }
    }
  }

  // De-duplicate against already-processed replies
  if (allReplies.length === 0) return [];

  const replyIds = allReplies.map((r) => r.id);
  const processed = await getProcessedReplyIds(replyIds);
  const newReplies = allReplies.filter((r) => !processed.has(r.id));

  log(`Found ${allReplies.length} total replies, ${newReplies.length} new`);
  return newReplies;
}

// ── AI: Evaluate whether to reply ────────────────────────────────────

interface EvalResult {
  decision: "reply" | "skip";
  reason: string;
  tone: "helpful" | "friendly" | "curious";
}

async function evaluateReply(
  reply: IncomingReply
): Promise<EvalResult> {
  const platformName = reply.platform === "bluesky" ? "Bluesky" : "Twitter";
  const result = await generateAgentJSON<EvalResult>(
    "twitter_growth",
    `You decide whether @tryarthaHQ should reply to a ${platformName} post that responded to one of our posts.

Artha is an AI platform that builds companies from a single prompt — landing page, market research, email, tasks.

REPLY to:
- Genuine questions about the topic or about Artha
- Thoughtful comments that open a conversation
- People sharing their own experience (relate to them)
- Comments where mentioning Artha would be genuinely helpful

SKIP:
- One-word reactions ("nice", "lol", "true", "this")
- Spam or self-promotion
- Trolling or negativity
- Replies that don't need a response (retweet-style affirmations)
- Anything where replying would seem forced or spammy

Return JSON: { decision: "reply" | "skip", reason: string, tone: "helpful" | "friendly" | "curious" }
- reason: 1 sentence explaining why
- tone: how our reply should feel`,
    `Our original tweet:
${reply.sourceContent}

Their reply (@${reply.authorUsername}${reply.authorVerified ? ", verified" : ""}):
${reply.text}`
  );

  return result;
}

// ── AI: Generate reply text ──────────────────────────────────────────

async function generateReplyText(
  reply: IncomingReply,
  tone: string
): Promise<string> {
  const charLimit = reply.platform === "bluesky" ? BSKY_MAX : TWEET_MAX;
  const platformName = reply.platform === "bluesky" ? "Bluesky" : "Twitter";

  const result = await generateAgentJSON<{ text: string }>(
    "twitter_growth",
    `You write replies for @tryarthaHQ's ${platformName} account.

Artha is an AI platform that builds companies from a single prompt — landing page, market research, email, tasks. URL: artha.run

Rules — follow every one:
- Reply must be ≤${charLimit} characters
- Be ${tone} — this is a conversation, not a pitch
- Answer questions directly if asked
- If Artha is relevant, mention it naturally (not forced). Include artha.run only if genuinely useful.
- Do NOT start with "Great point!", "Love this!", "So true!" or other sycophantic openers
- Do NOT use hashtags or emojis
- Sound like a knowledgeable founder, not a brand account
- Keep it conversational and concise
- Never be defensive or argumentative
- Reference what they actually said — show you read their reply

Return JSON: { text: string }`,
    `Our original post:
${reply.sourceContent}

Their reply (@${reply.authorUsername}):
${reply.text}

Tone: ${tone}`
  );

  let text = result.text.trim();
  if (text.length > charLimit) {
    text = text.slice(0, charLimit - 3) + "...";
  }
  return text;
}

// ── Process a single reply ───────────────────────────────────────────

async function processReply(
  reply: IncomingReply,
  dryRun: boolean
): Promise<{ decision: "reply" | "skip" | "error"; reason: string; responseUrl?: string }> {
  // Step 1: AI evaluation
  let evaluation: EvalResult;
  try {
    evaluation = await evaluateReply(reply);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`ERROR evaluating reply from @${reply.authorUsername} on ${reply.platform}: ${msg}`);
    await recordReplyDecision({
      sourcePostId: reply.sourcePostId,
      sourceTweetId: reply.sourceTweetId,
      replyTweetId: reply.id,
      replyAuthorId: reply.authorId,
      replyAuthorUsername: reply.authorUsername,
      replyText: reply.text,
      replyVerified: reply.authorVerified,
      decision: "error",
      decisionReason: `Evaluation failed: ${msg}`,
      platform: reply.platform,
    });
    return { decision: "error", reason: msg };
  }

  if (evaluation.decision === "skip") {
    log(`SKIP @${reply.authorUsername} (${reply.platform}): ${evaluation.reason}`);
    await recordReplyDecision({
      sourcePostId: reply.sourcePostId,
      sourceTweetId: reply.sourceTweetId,
      replyTweetId: reply.id,
      replyAuthorId: reply.authorId,
      replyAuthorUsername: reply.authorUsername,
      replyText: reply.text,
      replyVerified: reply.authorVerified,
      decision: "skip",
      decisionReason: evaluation.reason,
      platform: reply.platform,
    });
    return { decision: "skip", reason: evaluation.reason };
  }

  // Step 2: Generate reply text
  let replyText: string;
  try {
    replyText = await generateReplyText(reply, evaluation.tone);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`ERROR generating reply for @${reply.authorUsername} on ${reply.platform}: ${msg}`);
    await recordReplyDecision({
      sourcePostId: reply.sourcePostId,
      sourceTweetId: reply.sourceTweetId,
      replyTweetId: reply.id,
      replyAuthorId: reply.authorId,
      replyAuthorUsername: reply.authorUsername,
      replyText: reply.text,
      replyVerified: reply.authorVerified,
      decision: "error",
      decisionReason: `Generation failed: ${msg}`,
      platform: reply.platform,
    });
    return { decision: "error", reason: msg };
  }

  log(`REPLY to @${reply.authorUsername} (${reply.platform}): "${replyText.slice(0, 80)}..."`);

  if (dryRun) {
    log(`[DRY RUN] Would post ${reply.platform} reply`);
    await recordReplyDecision({
      sourcePostId: reply.sourcePostId,
      sourceTweetId: reply.sourceTweetId,
      replyTweetId: reply.id,
      replyAuthorId: reply.authorId,
      replyAuthorUsername: reply.authorUsername,
      replyText: reply.text,
      replyVerified: reply.authorVerified,
      decision: "reply",
      decisionReason: evaluation.reason,
      ourResponseText: replyText,
      platform: reply.platform,
    });
    return { decision: "reply", reason: evaluation.reason };
  }

  // Step 3: Post the reply (route by platform)
  try {
    let responseId: string;
    let responseUrl: string;

    if (reply.platform === "bluesky") {
      // Bluesky reply — need parent URI/CID and root URI
      if (!reply.blueskyParentCid) {
        throw new Error("Missing Bluesky parent CID — cannot reply");
      }

      // Get the CID for the reply we're responding to
      let replyCid: string;
      try {
        replyCid = await getBlueskyPostCid(reply.blueskyParentUri!);
      } catch {
        replyCid = reply.blueskyParentCid; // Fallback to parent post CID
      }

      const posted = await replyToBlueskyPost({
        text: replyText,
        parentUri: reply.blueskyParentUri!,
        parentCid: replyCid,
        rootUri: reply.blueskyRootUri,
        rootCid: reply.blueskyParentCid,
      });
      responseId = posted.uri;
      responseUrl = posted.postUrl;
      log(`Posted Bluesky reply: ${responseUrl}`);
    } else {
      // Twitter reply
      const posted = await replyToTweet({ text: replyText, inReplyToTweetId: reply.id });
      responseId = posted.tweetId;
      responseUrl = posted.tweetUrl;
      log(`Posted Twitter reply: ${responseUrl}`);
    }

    await recordReplyDecision({
      sourcePostId: reply.sourcePostId,
      sourceTweetId: reply.sourceTweetId,
      replyTweetId: reply.id,
      replyAuthorId: reply.authorId,
      replyAuthorUsername: reply.authorUsername,
      replyText: reply.text,
      replyVerified: reply.authorVerified,
      decision: "reply",
      decisionReason: evaluation.reason,
      ourResponseTweetId: responseId,
      ourResponseText: replyText,
      ourResponseUrl: responseUrl,
      platform: reply.platform,
    });

    return { decision: "reply", reason: evaluation.reason, responseUrl };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`ERROR posting reply to @${reply.authorUsername} on ${reply.platform}: ${msg}`);
    await recordReplyDecision({
      sourcePostId: reply.sourcePostId,
      sourceTweetId: reply.sourceTweetId,
      replyTweetId: reply.id,
      replyAuthorId: reply.authorId,
      replyAuthorUsername: reply.authorUsername,
      replyText: reply.text,
      replyVerified: reply.authorVerified,
      decision: "error",
      decisionReason: `Post failed: ${msg}`,
      platform: reply.platform,
    });
    return { decision: "error", reason: msg };
  }
}

// ── Main entry point ─────────────────────────────────────────────────

export interface ReplyEngineOptions {
  dryRun?: boolean;
  maxReplies?: number;
  platform?: "twitter" | "bluesky" | "all";
}

export async function runReplyEngine(
  options?: ReplyEngineOptions
): Promise<ReplyEngineResult> {
  const dryRun = options?.dryRun ?? false;
  const maxReplies = Math.min(options?.maxReplies ?? 5, MAX_DAILY_REPLIES);

  const result: ReplyEngineResult = {
    processed: 0,
    replied: 0,
    skipped: 0,
    errors: 0,
    replies: [],
  };

  // Only run during PST daytime (8 AM - 9 PM) to save API costs
  if (!dryRun && !isWithinReplyWindow()) {
    const hour = getPSTHour();
    log(`Outside reply window (${REPLY_WINDOW_START}AM-${REPLY_WINDOW_END - 12}PM PST, currently ${hour > 12 ? hour - 12 : hour}${hour >= 12 ? "PM" : "AM"}). Skipping.`);
    return result;
  }

  // Check daily cap
  const todayCount = await getTodayReplyCount();
  if (todayCount >= MAX_DAILY_REPLIES) {
    log(`Daily reply cap reached (${todayCount}/${MAX_DAILY_REPLIES}). Skipping.`);
    return result;
  }

  const remaining = MAX_DAILY_REPLIES - todayCount;
  const limit = Math.min(maxReplies, remaining);
  log(`Daily budget: ${remaining} replies remaining, will process up to ${limit}`);

  // Fetch new replies
  const platform = options?.platform ?? "all";
  const newReplies = await fetchNewReplies(platform);
  if (newReplies.length === 0) {
    log("No new replies to process.");
    return result;
  }

  // Process up to limit
  const toProcess = newReplies.slice(0, limit);
  for (const reply of toProcess) {
    log(`\nProcessing reply from @${reply.authorUsername}: "${reply.text.slice(0, 60)}..."`);
    const outcome = await processReply(reply, dryRun);
    result.processed++;

    result.replies.push({
      to: `@${reply.authorUsername}`,
      decision: outcome.decision === "error" ? "skip" : outcome.decision,
      reason: outcome.reason,
      responseUrl: outcome.responseUrl,
    });

    if (outcome.decision === "reply") result.replied++;
    else if (outcome.decision === "skip") result.skipped++;
    else result.errors++;
  }

  log(`\nDone: ${result.replied} replied, ${result.skipped} skipped, ${result.errors} errors`);
  return result;
}
