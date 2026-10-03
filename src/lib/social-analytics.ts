import { getDb } from "@/lib/neon";

// ── Types ────────────────────────────────────────────────────────────

export interface PostAnalytics {
  totalPosts: number;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  postsPerDay: number;
  earliestPost: string | null;
  latestPost: string | null;
}

export interface EngagementSummary {
  postsPerDay: number;
  postsThisWeek: number;
  postsThisMonth: number;
  mostActiveDay: string | null; // e.g. "Monday"
  postingStreak: number; // consecutive days with posts
  totalPosts: number;
}

export interface OptimalPostingTime {
  hour: number; // 0-23
  day: number; // 0=Sunday, 6=Saturday
  dayLabel: string;
  count: number;
}

export interface PostingHeatmap {
  grid: number[][]; // 7 rows (days) x 24 cols (hours)
  maxCount: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// ── getPostAnalytics ─────────────────────────────────────────────────

export async function getPostAnalytics(
  projectId: string,
  days: number = 30,
): Promise<PostAnalytics> {
  const db = getDb();
  const since = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Total count + by category
  const categoryRows = await db`
    SELECT category, COUNT(*)::int AS count
    FROM twitter_bot_posts
    WHERE project_id = ${projectId}
      AND created_at >= ${since}
    GROUP BY category
    ORDER BY count DESC
  `;

  const byCategory: Record<string, number> = {};
  let totalPosts = 0;
  for (const row of categoryRows) {
    const cat = row.category as string;
    const count = row.count as number;
    byCategory[cat] = count;
    totalPosts += count;
  }

  // By status
  const statusRows = await db`
    SELECT status, COUNT(*)::int AS count
    FROM twitter_bot_posts
    WHERE project_id = ${projectId}
      AND created_at >= ${since}
    GROUP BY status
  `;

  const byStatus: Record<string, number> = {};
  for (const row of statusRows) {
    byStatus[row.status as string] = row.count as number;
  }

  // Date range
  const rangeRows = await db`
    SELECT
      MIN(posted_at)::text AS earliest,
      MAX(posted_at)::text AS latest
    FROM twitter_bot_posts
    WHERE project_id = ${projectId}
      AND created_at >= ${since}
      AND posted_at IS NOT NULL
  `;

  const earliest = (rangeRows[0]?.earliest as string) ?? null;
  const latest = (rangeRows[0]?.latest as string) ?? null;

  // Posts per day
  const daySpan = earliest && latest
    ? Math.max(
        1,
        Math.ceil(
          (new Date(latest).getTime() - new Date(earliest).getTime()) /
            (24 * 60 * 60 * 1000),
        ),
      )
    : days;

  return {
    totalPosts,
    byCategory,
    byStatus,
    postsPerDay: totalPosts / daySpan,
    earliestPost: earliest,
    latestPost: latest,
  };
}

// ── getEngagementSummary ─────────────────────────────────────────────

export async function getEngagementSummary(
  projectId: string,
): Promise<EngagementSummary> {
  const db = getDb();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Total + this week + this month
  const countRows = await db`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE posted_at >= ${weekAgo})::int AS this_week,
      COUNT(*) FILTER (WHERE posted_at >= ${monthAgo})::int AS this_month
    FROM twitter_bot_posts
    WHERE project_id = ${projectId}
      AND status = 'posted'
  `;

  const total = (countRows[0]?.total as number) ?? 0;
  const thisWeek = (countRows[0]?.this_week as number) ?? 0;
  const thisMonth = (countRows[0]?.this_month as number) ?? 0;

  // Most active day of week
  const dayRows = await db`
    SELECT
      EXTRACT(DOW FROM posted_at)::int AS dow,
      COUNT(*)::int AS count
    FROM twitter_bot_posts
    WHERE project_id = ${projectId}
      AND status = 'posted'
      AND posted_at IS NOT NULL
    GROUP BY dow
    ORDER BY count DESC
    LIMIT 1
  `;

  const mostActiveDay = dayRows.length > 0
    ? DAY_LABELS[dayRows[0].dow as number] ?? null
    : null;

  // Posting streak: count consecutive days ending today that have a post
  const streakRows = await db`
    SELECT DISTINCT DATE(posted_at) AS post_date
    FROM twitter_bot_posts
    WHERE project_id = ${projectId}
      AND status = 'posted'
      AND posted_at >= ${new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()}
    ORDER BY post_date DESC
  `;

  let streak = 0;
  const todayStr = now.toISOString().slice(0, 10);
  let checkDate = new Date(todayStr);

  for (const row of streakRows) {
    const postDate = (row.post_date as string).slice(0, 10);
    const checkStr = checkDate.toISOString().slice(0, 10);

    if (postDate === checkStr) {
      streak++;
      checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
    } else if (postDate < checkStr) {
      break;
    }
  }

  // Posts per day over last 30 days
  const postsPerDay = thisMonth / 30;

  return {
    postsPerDay,
    postsThisWeek: thisWeek,
    postsThisMonth: thisMonth,
    mostActiveDay,
    postingStreak: streak,
    totalPosts: total,
  };
}

// ── getOptimalPostingTimes ───────────────────────────────────────────

export async function getOptimalPostingTimes(
  projectId: string,
): Promise<{ times: OptimalPostingTime[]; heatmap: PostingHeatmap }> {
  const db = getDb();

  const rows = await db`
    SELECT
      EXTRACT(DOW FROM posted_at)::int AS dow,
      EXTRACT(HOUR FROM posted_at)::int AS hour,
      COUNT(*)::int AS count
    FROM twitter_bot_posts
    WHERE project_id = ${projectId}
      AND status = 'posted'
      AND posted_at IS NOT NULL
    GROUP BY dow, hour
    ORDER BY count DESC
  `;

  const times: OptimalPostingTime[] = rows.map((row) => ({
    hour: row.hour as number,
    day: row.dow as number,
    dayLabel: DAY_LABELS[row.dow as number] ?? "Unknown",
    count: row.count as number,
  }));

  // Build heatmap grid: 7 days x 24 hours
  const grid: number[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0),
  );
  let maxCount = 0;

  for (const t of times) {
    grid[t.day][t.hour] = t.count;
    if (t.count > maxCount) maxCount = t.count;
  }

  return {
    times: times.slice(0, 10), // top 10
    heatmap: { grid, maxCount },
  };
}
