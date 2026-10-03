/**
 * Outbound Reply Engine — Replymer-style proactive engagement.
 *
 * Searches Twitter, Bluesky, and Reddit for conversations where people
 * discuss problems Artha solves, then replies helpfully.
 *
 * - Twitter + Bluesky: auto-post replies
 * - Reddit: log opportunities for manual posting (no API creds)
 */

import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { searchTweets, replyToTweet, type SearchedTweet } from "@/lib/twitter";
import {
  searchBlueskyPosts,
  replyToBlueskyPost,
  getBlueskyPostCid,
  isBlueskyConfigured,
  type BlueskySearchResult,
} from "./bluesky";
import { searchWebMulti } from "@/lib/search";
import {
  getTodayOutboundCount,
  getProcessedOutboundIds,
  hasRecentOutboundToAuthor,
  recordOutboundEngagement,
} from "./scheduler";

// ── Constants ────────────────────────────────────────────────────────

const MAX_DAILY_OUTBOUND = 50;
const MAX_DAILY_TWITTER = 20;
const MAX_DAILY_BLUESKY = 15;
const MAX_DAILY_REDDIT = 15; // manual logs only

const TWEET_MAX = 280;
const BSKY_MAX = 300;

// No time window — outbound runs 24/7. Conversations about startup
// building happen at all hours, and timely replies get more engagement.

const RELEVANCE_THRESHOLD = 0.7;

function log(msg: string) {
  const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
  console.log(`[outbound-engine ${ts}] ${msg}`);
}

// ── Keywords ─────────────────────────────────────────────────────────

const OUTBOUND_KEYWORDS = {
  twitter: [
    '"build a startup" OR "start a business" min_faves:5 -is:retweet lang:en',
    '"landing page" (need OR help OR build OR create) min_faves:3 -is:retweet lang:en',
    '"validate my idea" OR "validate startup idea" -is:retweet lang:en',
    '"mvp builder" OR "no code" (startup OR business) min_faves:3 -is:retweet lang:en',
    '"side project" (launch OR ship OR build) min_faves:5 -is:retweet lang:en',
    '"AI tool" (company OR business OR startup) (build OR create) min_faves:3 -is:retweet lang:en',
    '"need a website" (startup OR business OR project) -is:retweet lang:en',
    '"how to start" (company OR startup OR business) online -is:retweet lang:en',
  ],
  bluesky: [
    "build a startup",
    "landing page builder",
    "validate startup idea",
    "mvp builder",
    "ship side project",
    "AI company builder",
    "no code startup",
    "need a website startup",
  ],
  reddit: [
    'site:reddit.com "build a startup" OR "validate my idea"',
    'site:reddit.com "landing page" builder startup',
    'site:reddit.com "mvp" build startup idea',
    'site:reddit.com "side project" launch help',
    'site:reddit.com "no code" startup builder',
    'site:reddit.com "AI tool" build company',
  ],
};

// ── Types ────────────────────────────────────────────────────────────

interface Opportunity {
  platform: "twitter" | "bluesky" | "reddit";
  postId: string;
  postUrl: string;
  authorId: string;
  authorUsername: string;
  text: string;
  keyword: string;
  engagement?: number; // likes + retweets etc
  // Bluesky-specific
  blueskyUri?: string;
  blueSkyCid?: string;
}

interface EvalResult {
  decision: "reply" | "skip";
  relevanceScore: number;
  reason: string;
  tone: "helpful" | "friendly" | "curious" | "empathetic";
}

export interface OutboundEngineResult {
  discovered: number;
  replied: number;
  skipped: number;
  manual: number;
  errors: number;
  engagements: Array<{
    platform: string;
    to: string;
    decision: string;
    reason: string;
    replyUrl?: string;
  }>;
}

// ── Discovery ────────────────────────────────────────────────────────

async function discoverTwitter(
  processedIds: Set<string>
): Promise<Opportunity[]> {
  const opportunities: Opportunity[] = [];

  // Pick 3 random queries for variety
  const queries = [...OUTBOUND_KEYWORDS.twitter]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  for (const query of queries) {
    try {
      const tweets = await searchTweets(query, {
        maxResults: 15,
        sortOrder: "relevancy",
      });

      for (const tweet of tweets) {
        if (processedIds.has(tweet.id)) continue;

        opportunities.push({
          platform: "twitter",
          postId: tweet.id,
          postUrl: `https://x.com/${tweet.authorUsername}/status/${tweet.id}`,
          authorId: tweet.authorId,
          authorUsername: tweet.authorUsername,
          text: tweet.text,
          keyword: query,
          engagement: tweet.metrics.likes + tweet.metrics.retweets,
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(`WARN: Twitter search failed for "${query.slice(0, 40)}...": ${msg}`);
    }
  }

  return opportunities;
}

async function discoverBluesky(
  processedIds: Set<string>
): Promise<Opportunity[]> {
  if (!isBlueskyConfigured()) return [];

  const opportunities: Opportunity[] = [];

  // Pick 3 random queries
  const queries = [...OUTBOUND_KEYWORDS.bluesky]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  for (const query of queries) {
    try {
      const posts = await searchBlueskyPosts(query, 15);

      for (const post of posts) {
        if (processedIds.has(post.uri)) continue;

        opportunities.push({
          platform: "bluesky",
          postId: post.uri,
          postUrl: post.postUrl,
          authorId: post.authorDid,
          authorUsername: post.authorHandle,
          text: post.text,
          keyword: query,
          engagement: post.likeCount + post.repostCount,
          blueskyUri: post.uri,
          blueSkyCid: post.cid,
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(`WARN: Bluesky search failed for "${query}": ${msg}`);
    }
  }

  return opportunities;
}

async function discoverReddit(
  processedIds: Set<string>
): Promise<Opportunity[]> {
  const opportunities: Opportunity[] = [];

  // Pick 2 random queries
  const queries = [...OUTBOUND_KEYWORDS.reddit]
    .sort(() => Math.random() - 0.5)
    .slice(0, 2);

  try {
    const results = await searchWebMulti(queries, {
      engine: "brave",
      maxResultsPerQuery: 5,
      freshness: "pw", // past week
    });

    for (const response of results) {
      for (const result of response.results) {
        // Only Reddit URLs
        if (!result.url.includes("reddit.com")) continue;

        // Use URL as post ID for dedup
        const postId = result.url;
        if (processedIds.has(postId)) continue;

        opportunities.push({
          platform: "reddit",
          postId,
          postUrl: result.url,
          authorId: "",
          authorUsername: "", // Can't get from Brave results
          text: `${result.title}\n\n${result.content}`.trim(),
          keyword: response.query,
        });
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`WARN: Reddit search failed: ${msg}`);
  }

  return opportunities;
}

// ── AI Evaluation ────────────────────────────────────────────────────

async function evaluateOpportunity(opp: Opportunity): Promise<EvalResult> {
  const result = await generateAgentJSON<EvalResult>(
    "twitter_growth",
    `You evaluate whether @tryarthaHQ should proactively reply to a ${opp.platform} post.

Artha is an AI platform that builds companies from a single prompt — landing page, market research, email, tasks. URL: artha.run

REPLY if the person:
- Is asking a genuine question about building a startup/business/landing page/MVP
- Expressing a pain point that Artha directly solves (need a website, want to validate an idea, looking for tools)
- Seeking advice on launching a product or side project
- Discussing challenges where AI company-building would be relevant

SKIP if the post is:
- From a competitor or similar tool
- Self-promotion or spam
- A news article/announcement (not a personal question/need)
- Too vague or generic to add value
- From a big account where replying looks desperate (>100k followers typically)
- Already has many helpful replies
- About a topic where Artha isn't genuinely useful
- Our own post or from @tryarthaHQ

Return JSON:
{
  "decision": "reply" | "skip",
  "relevanceScore": 0.0-1.0,
  "reason": "1 sentence explaining why",
  "tone": "helpful" | "friendly" | "curious" | "empathetic"
}

relevanceScore: how well Artha fits this conversation (0 = irrelevant, 1 = perfect fit)`,
    `Platform: ${opp.platform}
Post by @${opp.authorUsername || "unknown"}:
${opp.text.slice(0, 500)}

Engagement: ${opp.engagement ?? "unknown"}`
  );

  return result;
}

// ── AI Reply Generation ──────────────────────────────────────────────

async function generateOutboundReply(
  opp: Opportunity,
  tone: string
): Promise<string> {
  const isReddit = opp.platform === "reddit";
  const charLimit = opp.platform === "bluesky" ? BSKY_MAX : isReddit ? 1500 : TWEET_MAX;
  const platformName = opp.platform === "bluesky" ? "Bluesky" : opp.platform === "reddit" ? "Reddit" : "Twitter";

  const result = await generateAgentJSON<{ text: string }>(
    "twitter_growth",
    `You write proactive outbound replies for @tryarthaHQ on ${platformName}.

Artha is an AI platform that builds companies from a single prompt — landing page, market research, email, tasks. URL: artha.run

CRITICAL RULES — follow every one:
- Reply must be <=${charLimit} characters
- Be ${tone} — you're joining THEIR conversation, not pitching
- Lead with genuine value: answer their question, share relevant insight, or empathize with their problem
- Mention Artha ONLY if it naturally fits. If it doesn't, just be helpful without mentioning it.
- When mentioning Artha, frame it as "I've been using/building X" or "there's a tool called X" — NEVER "check out our product"
- Include artha.run ONLY when directly relevant and natural
- Do NOT start with "Great question!", "Love this!", "Hey!" or sycophantic openers
- Do NOT use hashtags or emojis
- Sound like a knowledgeable founder helping another founder, NOT a brand account
- Be concise and conversational${isReddit ? "\n- For Reddit: can be longer and more detailed. Use paragraphs. Be genuinely helpful." : ""}
- Never tag or @mention anyone
- Reference what they actually said — show you read their post

Return JSON: { "text": string }`,
    `Their ${platformName} post (@${opp.authorUsername || "unknown"}):
${opp.text.slice(0, 500)}

Tone: ${tone}`
  );

  let text = result.text.trim();
  if (text.length > charLimit) {
    text = text.slice(0, charLimit - 3) + "...";
  }
  return text;
}

// ── Post Reply ───────────────────────────────────────────────────────

async function postReply(
  opp: Opportunity,
  replyText: string
): Promise<{ replyId: string; replyUrl: string }> {
  if (opp.platform === "twitter") {
    const posted = await replyToTweet({
      text: replyText,
      inReplyToTweetId: opp.postId,
    });
    return { replyId: posted.tweetId, replyUrl: posted.tweetUrl };
  }

  if (opp.platform === "bluesky") {
    const cid = opp.blueSkyCid || (await getBlueskyPostCid(opp.blueskyUri!));
    const posted = await replyToBlueskyPost({
      text: replyText,
      parentUri: opp.blueskyUri!,
      parentCid: cid,
    });
    return { replyId: posted.uri, replyUrl: posted.postUrl };
  }

  // Reddit — can't post, shouldn't reach here
  throw new Error("Reddit auto-reply not supported (no API creds)");
}

// ── Process a single opportunity ─────────────────────────────────────

async function processOpportunity(
  opp: Opportunity,
  dryRun: boolean
): Promise<{ decision: string; reason: string; replyUrl?: string }> {
  // Anti-stalking: skip if we've engaged this author recently
  if (opp.authorUsername) {
    const recentlyEngaged = await hasRecentOutboundToAuthor(opp.platform, opp.authorUsername);
    if (recentlyEngaged) {
      log(`SKIP @${opp.authorUsername} (${opp.platform}): engaged in last 7 days`);
      return { decision: "skip", reason: "Recently engaged this author (7-day cooldown)" };
    }
  }

  // AI evaluation
  let evaluation: EvalResult;
  try {
    evaluation = await evaluateOpportunity(opp);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`ERROR evaluating ${opp.platform} post: ${msg}`);
    await recordOutboundEngagement({
      platform: opp.platform,
      sourcePostId: opp.postId,
      sourcePostUrl: opp.postUrl,
      sourceAuthorId: opp.authorId,
      sourceAuthorUsername: opp.authorUsername,
      sourceText: opp.text,
      searchKeyword: opp.keyword,
      decision: "error",
      decisionReason: `Evaluation failed: ${msg}`,
    });
    return { decision: "error", reason: msg };
  }

  // Check relevance threshold
  if (evaluation.decision === "skip" || evaluation.relevanceScore < RELEVANCE_THRESHOLD) {
    log(`SKIP @${opp.authorUsername || "?"} (${opp.platform}, score=${evaluation.relevanceScore.toFixed(2)}): ${evaluation.reason}`);
    await recordOutboundEngagement({
      platform: opp.platform,
      sourcePostId: opp.postId,
      sourcePostUrl: opp.postUrl,
      sourceAuthorId: opp.authorId,
      sourceAuthorUsername: opp.authorUsername,
      sourceText: opp.text,
      searchKeyword: opp.keyword,
      relevanceScore: evaluation.relevanceScore,
      decision: "skip",
      decisionReason: evaluation.reason,
    });
    return { decision: "skip", reason: evaluation.reason };
  }

  // Generate reply
  let replyText: string;
  try {
    replyText = await generateOutboundReply(opp, evaluation.tone);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`ERROR generating reply for ${opp.platform}: ${msg}`);
    await recordOutboundEngagement({
      platform: opp.platform,
      sourcePostId: opp.postId,
      sourcePostUrl: opp.postUrl,
      sourceAuthorId: opp.authorId,
      sourceAuthorUsername: opp.authorUsername,
      sourceText: opp.text,
      searchKeyword: opp.keyword,
      relevanceScore: evaluation.relevanceScore,
      decision: "error",
      decisionReason: `Generation failed: ${msg}`,
    });
    return { decision: "error", reason: msg };
  }

  log(`${opp.platform === "reddit" ? "MANUAL" : "REPLY"} @${opp.authorUsername || "?"} (${opp.platform}, score=${evaluation.relevanceScore.toFixed(2)}): "${replyText.slice(0, 80)}..."`);

  // Reddit: log for manual posting
  if (opp.platform === "reddit") {
    await recordOutboundEngagement({
      platform: opp.platform,
      sourcePostId: opp.postId,
      sourcePostUrl: opp.postUrl,
      sourceAuthorId: opp.authorId,
      sourceAuthorUsername: opp.authorUsername,
      sourceText: opp.text,
      searchKeyword: opp.keyword,
      relevanceScore: evaluation.relevanceScore,
      decision: "manual",
      decisionReason: evaluation.reason,
      ourReplyText: replyText,
    });
    return { decision: "manual", reason: evaluation.reason };
  }

  // Dry run
  if (dryRun) {
    log(`[DRY RUN] Would post ${opp.platform} reply`);
    await recordOutboundEngagement({
      platform: opp.platform,
      sourcePostId: opp.postId,
      sourcePostUrl: opp.postUrl,
      sourceAuthorId: opp.authorId,
      sourceAuthorUsername: opp.authorUsername,
      sourceText: opp.text,
      searchKeyword: opp.keyword,
      relevanceScore: evaluation.relevanceScore,
      decision: "reply",
      decisionReason: evaluation.reason,
      ourReplyText: replyText,
    });
    return { decision: "reply", reason: evaluation.reason };
  }

  // Post the reply
  try {
    const { replyId, replyUrl } = await postReply(opp, replyText);
    log(`Posted ${opp.platform} reply: ${replyUrl}`);

    await recordOutboundEngagement({
      platform: opp.platform,
      sourcePostId: opp.postId,
      sourcePostUrl: opp.postUrl,
      sourceAuthorId: opp.authorId,
      sourceAuthorUsername: opp.authorUsername,
      sourceText: opp.text,
      searchKeyword: opp.keyword,
      relevanceScore: evaluation.relevanceScore,
      decision: "reply",
      decisionReason: evaluation.reason,
      ourReplyText: replyText,
      ourReplyId: replyId,
      ourReplyUrl: replyUrl,
    });

    return { decision: "reply", reason: evaluation.reason, replyUrl };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`ERROR posting ${opp.platform} reply: ${msg}`);
    await recordOutboundEngagement({
      platform: opp.platform,
      sourcePostId: opp.postId,
      sourcePostUrl: opp.postUrl,
      sourceAuthorId: opp.authorId,
      sourceAuthorUsername: opp.authorUsername,
      sourceText: opp.text,
      searchKeyword: opp.keyword,
      relevanceScore: evaluation.relevanceScore,
      decision: "error",
      decisionReason: `Post failed: ${msg}`,
      ourReplyText: replyText,
    });
    return { decision: "error", reason: msg };
  }
}

// ── Main entry point ─────────────────────────────────────────────────

export interface OutboundEngineOptions {
  dryRun?: boolean;
  maxReplies?: number;
  platform?: "twitter" | "bluesky" | "reddit" | "all";
}

export async function runOutboundEngine(
  options?: OutboundEngineOptions
): Promise<OutboundEngineResult> {
  const dryRun = options?.dryRun ?? false;
  const maxReplies = Math.min(options?.maxReplies ?? 5, MAX_DAILY_OUTBOUND);
  const platform = options?.platform ?? "all";

  const result: OutboundEngineResult = {
    discovered: 0,
    replied: 0,
    skipped: 0,
    manual: 0,
    errors: 0,
    engagements: [],
  };

  // Check daily cap
  const todayTotal = await getTodayOutboundCount();
  if (todayTotal >= MAX_DAILY_OUTBOUND) {
    log(`Daily outbound cap reached (${todayTotal}/${MAX_DAILY_OUTBOUND}). Skipping.`);
    return result;
  }

  const remaining = MAX_DAILY_OUTBOUND - todayTotal;
  const limit = Math.min(maxReplies, remaining);
  log(`Daily budget: ${remaining} outbound remaining, will process up to ${limit}`);

  // Discover opportunities across platforms
  const allOpportunities: Opportunity[] = [];

  if (platform === "twitter" || platform === "all") {
    const todayTwitter = await getTodayOutboundCount("twitter");
    if (todayTwitter < MAX_DAILY_TWITTER) {
      const processedIds = await getProcessedOutboundIds("twitter");
      const twOps = await discoverTwitter(processedIds);
      log(`Twitter: discovered ${twOps.length} opportunities`);
      allOpportunities.push(...twOps);
    } else {
      log(`Twitter daily cap reached (${todayTwitter}/${MAX_DAILY_TWITTER})`);
    }
  }

  if (platform === "bluesky" || platform === "all") {
    const todayBsky = await getTodayOutboundCount("bluesky");
    if (todayBsky < MAX_DAILY_BLUESKY) {
      const processedIds = await getProcessedOutboundIds("bluesky");
      const bskyOps = await discoverBluesky(processedIds);
      log(`Bluesky: discovered ${bskyOps.length} opportunities`);
      allOpportunities.push(...bskyOps);
    } else {
      log(`Bluesky daily cap reached (${todayBsky}/${MAX_DAILY_BLUESKY})`);
    }
  }

  if (platform === "reddit" || platform === "all") {
    const todayReddit = await getTodayOutboundCount("reddit");
    if (todayReddit < MAX_DAILY_REDDIT) {
      const processedIds = await getProcessedOutboundIds("reddit");
      const redditOps = await discoverReddit(processedIds);
      log(`Reddit: discovered ${redditOps.length} opportunities`);
      allOpportunities.push(...redditOps);
    } else {
      log(`Reddit daily cap reached (${todayReddit}/${MAX_DAILY_REDDIT})`);
    }
  }

  result.discovered = allOpportunities.length;

  if (allOpportunities.length === 0) {
    log("No new opportunities found.");
    return result;
  }

  // Sort by engagement (higher = more visibility) and pick top N
  allOpportunities.sort((a, b) => (b.engagement ?? 0) - (a.engagement ?? 0));
  const toProcess = allOpportunities.slice(0, limit);

  log(`Processing ${toProcess.length} of ${allOpportunities.length} opportunities`);

  for (const opp of toProcess) {
    log(`\nEvaluating ${opp.platform} post by @${opp.authorUsername || "?"}: "${opp.text.slice(0, 60)}..."`);
    const outcome = await processOpportunity(opp, dryRun);

    result.engagements.push({
      platform: opp.platform,
      to: `@${opp.authorUsername || "unknown"}`,
      decision: outcome.decision,
      reason: outcome.reason,
      replyUrl: outcome.replyUrl,
    });

    if (outcome.decision === "reply") result.replied++;
    else if (outcome.decision === "skip") result.skipped++;
    else if (outcome.decision === "manual") result.manual++;
    else result.errors++;
  }

  log(`\nDone: ${result.replied} replied, ${result.manual} manual, ${result.skipped} skipped, ${result.errors} errors`);
  return result;
}
