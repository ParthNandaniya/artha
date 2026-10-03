import { getDb } from "@/lib/neon";

export type ContentSlot = "showcase" | "tip" | "thread" | "article" | "founder_story" | "shorts" | "trending";

export interface TwitterBotPost {
  id: string;
  category: ContentSlot;
  tweet_ids: string[];
  tweet_urls: string[];
  content: string;
  project_id: string | null;
  status: string;
  topic: string | null;
  posted_at: string | null;
  created_at: string;
}

export interface ShowcaseableProject {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  oneLiner: string | null;
  visitors: number;
}

// Daily quotas per category
// Total: ~20 posts/day — heavy on trending/news, light on filler
const DAILY_QUOTAS: Record<ContentSlot, number> = {
  trending: 10,      // breaking news, stocks, celebrity tech, AI tools — main content engine
  showcase: 3,       // visual, shareable — company highlights
  tip: 0,            // disabled — replaced by trending takes
  founder_story: 3,  // real founder metrics — still high engagement
  thread: 0,         // disabled — long threads replaced by punchy news
  article: 0,        // disabled
  shorts: 2,         // video shorts via InVideo
};

function getDailyQuota(category: ContentSlot): number {
  return DAILY_QUOTAS[category];
}

/**
 * Get counts of posts already made today per category.
 */
async function getTodayCounts(): Promise<Record<ContentSlot, number>> {
  const db = getDb();
  const rows = await db`
    SELECT category, COUNT(*)::int AS cnt
    FROM twitter_bot_posts
    WHERE status = 'posted'
      AND posted_at >= CURRENT_DATE
    GROUP BY category
  `;

  const counts: Record<ContentSlot, number> = { trending: 0, showcase: 0, tip: 0, founder_story: 0, thread: 0, article: 0, shorts: 0 };
  for (const row of rows as Array<{ category: string; cnt: number }>) {
    if (row.category in counts) {
      counts[row.category as ContentSlot] = row.cnt;
    }
  }
  return counts;
}

/**
 * Decide what to post next based on daily quotas and what's already been posted.
 * Priority: showcase > tip > thread > article
 */
export async function getNextContentSlot(
  skipSlots?: Set<ContentSlot>
): Promise<ContentSlot | null> {
  const counts = await getTodayCounts();
  const priority: ContentSlot[] = ["trending", "showcase", "founder_story", "shorts", "tip", "thread", "article"];

  for (const slot of priority) {
    if (skipSlots?.has(slot)) continue;
    const quota = getDailyQuota(slot);
    if (quota > 0 && counts[slot] < quota) {
      return slot;
    }
  }

  return null;
}

/**
 * Get recent posts for a category (for topic dedup).
 */
export async function getRecentTopics(
  category: ContentSlot,
  limit = 10
): Promise<string[]> {
  const db = getDb();
  const rows = await db`
    SELECT topic
    FROM twitter_bot_posts
    WHERE category = ${category}
      AND topic IS NOT NULL
      AND status = 'posted'
    ORDER BY posted_at DESC
    LIMIT ${limit}
  `;
  return (rows as Array<{ topic: string }>).map((r) => r.topic);
}

/**
 * Get projects eligible for showcase tweets.
 * Must be active with a published landing page, not showcased in last 14 days.
 */
export async function getShowcaseableProjects(): Promise<ShowcaseableProject[]> {
  const db = getDb();
  const rows = await db`
    SELECT
      p.id,
      p.name,
      p.slug,
      COALESCE(cp.tagline, p.memory->>'tagline', '') AS tagline,
      COALESCE(p.memory->>'oneLiner', p.memory->>'companyDescription', '') AS "oneLiner",
      COALESCE(
        (SELECT COUNT(DISTINCT visitor_id)::int
         FROM site_analytics
         WHERE project_id = p.id
           AND created_at > NOW() - INTERVAL '7 days'),
        0
      ) AS visitors
    FROM projects p
    LEFT JOIN company_profile cp ON cp.project_id = p.id
    WHERE p.status = 'active'
      AND p.landing_page_published = TRUE
      AND COALESCE(p.hidden, false) = false
      AND p.id NOT IN (
        SELECT project_id FROM twitter_bot_posts
        WHERE category = 'showcase'
          AND project_id IS NOT NULL
          AND status = 'posted'
          AND posted_at > NOW() - INTERVAL '7 days'
      )
    ORDER BY visitors DESC, p.created_at DESC
    LIMIT 10
  `;

  return rows as ShowcaseableProject[];
}

/**
 * Get tweet IDs from bot posts in the last N days (for reply engine).
 * Returns { postId, tweetId, content } so the reply engine can match
 * replies back to our original posts.
 */
export async function getRecentBotTweetIds(
  daysBack = 1
): Promise<Array<{ postId: string; tweetId: string; content: string }>> {
  const db = getDb();
  // Only fetches tweets from twitter_bot_posts (growth bot posts),
  // NOT launch tweets from onboarding/dashboard (those are in a different flow)
  const rows = await db`
    SELECT id AS "postId", unnest(tweet_ids) AS "tweetId", content
    FROM twitter_bot_posts
    WHERE status = 'posted'
      AND array_length(tweet_ids, 1) > 0
      AND posted_at >= NOW() - INTERVAL '1 day' * ${daysBack}
    ORDER BY posted_at DESC
  `;
  return rows as Array<{ postId: string; tweetId: string; content: string }>;
}

/**
 * Get recent Bluesky post URIs from bot posts (for reply engine).
 * Reads bluesky_uris from the metadata JSONB field.
 */
export async function getRecentBotBlueskyUris(
  daysBack = 1
): Promise<Array<{ postId: string; uri: string; content: string }>> {
  const db = getDb();
  const rows = await db`
    SELECT
      id AS "postId",
      unnest(
        ARRAY(SELECT jsonb_array_elements_text(metadata->'bluesky_uris'))
      ) AS uri,
      content
    FROM twitter_bot_posts
    WHERE status = 'posted'
      AND metadata->'bluesky_uris' IS NOT NULL
      AND jsonb_array_length(metadata->'bluesky_uris') > 0
      AND posted_at >= NOW() - INTERVAL '1 day' * ${daysBack}
    ORDER BY posted_at DESC
  `;
  return rows as Array<{ postId: string; uri: string; content: string }>;
}

/**
 * Get count of auto-replies sent today (for daily cap enforcement).
 */
export async function getTodayReplyCount(): Promise<number> {
  const db = getDb();
  const [row] = await db`
    SELECT COUNT(*)::int AS cnt
    FROM twitter_bot_replies
    WHERE decision = 'reply'
      AND replied_at >= CURRENT_DATE
  `;
  return (row as { cnt: number }).cnt;
}

/**
 * Get reply tweet IDs we've already processed (for dedup).
 */
export async function getProcessedReplyIds(replyTweetIds: string[]): Promise<Set<string>> {
  if (replyTweetIds.length === 0) return new Set();
  const db = getDb();
  const rows = await db`
    SELECT reply_tweet_id
    FROM twitter_bot_replies
    WHERE reply_tweet_id = ANY(${replyTweetIds})
  `;
  return new Set((rows as Array<{ reply_tweet_id: string }>).map((r) => r.reply_tweet_id));
}

/**
 * Record a reply decision (replied, skipped, or errored).
 */
export async function recordReplyDecision(entry: {
  sourcePostId: string | null;
  sourceTweetId: string;
  replyTweetId: string;
  replyAuthorId: string;
  replyAuthorUsername: string;
  replyText: string;
  replyVerified: boolean;
  decision: "reply" | "skip" | "error";
  decisionReason: string;
  ourResponseTweetId?: string | null;
  ourResponseText?: string | null;
  ourResponseUrl?: string | null;
  platform?: string;
}): Promise<void> {
  const db = getDb();
  await db`
    INSERT INTO twitter_bot_replies (
      source_post_id, source_tweet_id, reply_tweet_id,
      reply_author_id, reply_author_username, reply_text, reply_verified,
      decision, decision_reason,
      our_response_tweet_id, our_response_text, our_response_url,
      platform, replied_at
    ) VALUES (
      ${entry.sourcePostId},
      ${entry.sourceTweetId},
      ${entry.replyTweetId},
      ${entry.replyAuthorId},
      ${entry.replyAuthorUsername},
      ${entry.replyText},
      ${entry.replyVerified},
      ${entry.decision},
      ${entry.decisionReason},
      ${entry.ourResponseTweetId || null},
      ${entry.ourResponseText || null},
      ${entry.ourResponseUrl || null},
      ${entry.platform || "twitter"},
      ${entry.decision === "reply" ? new Date().toISOString() : null}
    )
    ON CONFLICT (reply_tweet_id) DO NOTHING
  `;
}

// ── Outbound engagement helpers ──────────────────────────────────────

export interface OutboundEngagementRecord {
  platform: string;
  sourcePostId: string;
  sourcePostUrl?: string | null;
  sourceAuthorId?: string | null;
  sourceAuthorUsername?: string | null;
  sourceText: string;
  searchKeyword?: string | null;
  relevanceScore?: number | null;
  decision: "reply" | "skip" | "manual" | "error";
  decisionReason?: string | null;
  ourReplyText?: string | null;
  ourReplyId?: string | null;
  ourReplyUrl?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Count today's outbound engagements (for daily quota).
 */
export async function getTodayOutboundCount(platform?: string): Promise<number> {
  const db = getDb();
  const [row] = platform
    ? await db`
        SELECT COUNT(*)::int AS cnt
        FROM outbound_engagements
        WHERE decision IN ('reply', 'manual')
          AND created_at >= CURRENT_DATE
          AND platform = ${platform}
      `
    : await db`
        SELECT COUNT(*)::int AS cnt
        FROM outbound_engagements
        WHERE decision IN ('reply', 'manual')
          AND created_at >= CURRENT_DATE
      `;
  return (row as { cnt: number }).cnt;
}

/**
 * Get already-processed source post IDs (for dedup).
 */
export async function getProcessedOutboundIds(platform: string): Promise<Set<string>> {
  const db = getDb();
  const rows = await db`
    SELECT source_post_id
    FROM outbound_engagements
    WHERE platform = ${platform}
  `;
  return new Set((rows as Array<{ source_post_id: string }>).map((r) => r.source_post_id));
}

/**
 * Check if we've engaged this author in the last 7 days (anti-stalking).
 */
export async function hasRecentOutboundToAuthor(
  platform: string,
  authorUsername: string
): Promise<boolean> {
  const db = getDb();
  const [row] = await db`
    SELECT COUNT(*)::int AS cnt
    FROM outbound_engagements
    WHERE platform = ${platform}
      AND source_author_username = ${authorUsername}
      AND decision IN ('reply', 'manual')
      AND created_at >= NOW() - INTERVAL '7 days'
  `;
  return (row as { cnt: number }).cnt > 0;
}

/**
 * Record an outbound engagement decision.
 */
export async function recordOutboundEngagement(entry: OutboundEngagementRecord): Promise<void> {
  const db = getDb();
  await db`
    INSERT INTO outbound_engagements (
      platform, source_post_id, source_post_url,
      source_author_id, source_author_username, source_text,
      search_keyword, relevance_score, decision, decision_reason,
      our_reply_text, our_reply_id, our_reply_url,
      metadata, replied_at
    ) VALUES (
      ${entry.platform},
      ${entry.sourcePostId},
      ${entry.sourcePostUrl || null},
      ${entry.sourceAuthorId || null},
      ${entry.sourceAuthorUsername || null},
      ${entry.sourceText},
      ${entry.searchKeyword || null},
      ${entry.relevanceScore || null},
      ${entry.decision},
      ${entry.decisionReason || null},
      ${entry.ourReplyText || null},
      ${entry.ourReplyId || null},
      ${entry.ourReplyUrl || null},
      ${JSON.stringify(entry.metadata || {})}::jsonb,
      ${entry.decision === "reply" ? new Date().toISOString() : null}
    )
    ON CONFLICT (platform, source_post_id) DO NOTHING
  `;
}

// ── Content posting helpers ─────────────────────────────────────────

/**
 * Record a posted (or failed) tweet in the tracking table.
 */
export async function recordPost(post: {
  category: ContentSlot;
  tweetIds: string[];
  tweetUrls: string[];
  content: string;
  projectId?: string | null;
  status: "posted" | "failed" | "draft";
  topic?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const db = getDb();
  const [row] = await db`
    INSERT INTO twitter_bot_posts (
      category, tweet_ids, tweet_urls, content, project_id,
      status, topic, error, metadata, posted_at
    ) VALUES (
      ${post.category},
      ${post.tweetIds},
      ${post.tweetUrls},
      ${post.content},
      ${post.projectId || null},
      ${post.status},
      ${post.topic || null},
      ${post.error || null},
      ${JSON.stringify(post.metadata || {})}::jsonb,
      ${post.status === "posted" ? new Date().toISOString() : null}
    )
    RETURNING id
  `;
  return (row as { id: string }).id;
}
