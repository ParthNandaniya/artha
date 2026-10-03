import { getDb } from "@/lib/neon";

export interface ProjectAnalyticsSummary {
  last7Days: {
    pageviews: number;
    uniqueVisitors: number;
    avgEngagementSec: number;
    topSource: string | null;
    bounceRate: number;
  };
  last30Days: {
    pageviews: number;
    uniqueVisitors: number;
  };
  prev7Days: {
    pageviews: number;
    uniqueVisitors: number;
  };
  hasActivity: boolean;
}

export async function getProjectAnalyticsSummary(
  projectId: string
): Promise<ProjectAnalyticsSummary> {
  const db = getDb();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [week, month, referrers, bounce, prevWeek] = await Promise.all([
    db`
      SELECT
        COUNT(*) FILTER (WHERE event = 'pageview') AS pageviews,
        COUNT(DISTINCT visitor_id) FILTER (WHERE event = 'pageview') AS unique_visitors,
        AVG(duration_ms) FILTER (WHERE event = 'pageview_end') AS avg_duration_ms
      FROM site_analytics
      WHERE project_id = ${projectId} AND created_at >= ${since7d}
    `,
    db`
      SELECT
        COUNT(*) FILTER (WHERE event = 'pageview') AS pageviews,
        COUNT(DISTINCT visitor_id) FILTER (WHERE event = 'pageview') AS unique_visitors
      FROM site_analytics
      WHERE project_id = ${projectId} AND created_at >= ${since30d}
    `,
    db`
      SELECT
        COALESCE(NULLIF(referrer, ''), '(direct)') AS source,
        COUNT(*) AS visits
      FROM site_analytics
      WHERE project_id = ${projectId} AND event = 'pageview' AND created_at >= ${since7d}
      GROUP BY 1 ORDER BY 2 DESC LIMIT 1
    `,
    // Bounce rate: sessions with only 1 pageview / total sessions
    db`
      SELECT
        COUNT(*) AS total_sessions,
        COUNT(*) FILTER (WHERE pv_count = 1) AS single_page_sessions
      FROM (
        SELECT session_id, COUNT(*) AS pv_count
        FROM site_analytics
        WHERE project_id = ${projectId} AND event = 'pageview' AND created_at >= ${since7d}
          AND session_id IS NOT NULL
        GROUP BY session_id
      ) sessions
    `,
    // Previous 7 days (for week-over-week comparison)
    db`
      SELECT
        COUNT(*) FILTER (WHERE event = 'pageview') AS pageviews,
        COUNT(DISTINCT visitor_id) FILTER (WHERE event = 'pageview') AS unique_visitors
      FROM site_analytics
      WHERE project_id = ${projectId}
        AND created_at >= ${since14d}
        AND created_at < ${since7d}
    `,
  ]);

  const pageviews7d = parseInt((week[0]?.pageviews as string) || "0", 10);
  const uniqueVisitors7d = parseInt(
    (week[0]?.unique_visitors as string) || "0",
    10
  );
  const pageviews30d = parseInt((month[0]?.pageviews as string) || "0", 10);
  const uniqueVisitors30d = parseInt(
    (month[0]?.unique_visitors as string) || "0",
    10
  );
  const totalSessions = parseInt((bounce[0]?.total_sessions as string) || "0", 10);
  const singlePageSessions = parseInt((bounce[0]?.single_page_sessions as string) || "0", 10);
  const bounceRate = totalSessions > 0 ? Math.round((singlePageSessions / totalSessions) * 100) : 0;

  const prevPageviews = parseInt((prevWeek[0]?.pageviews as string) || "0", 10);
  const prevVisitors = parseInt((prevWeek[0]?.unique_visitors as string) || "0", 10);

  return {
    last7Days: {
      pageviews: pageviews7d,
      uniqueVisitors: uniqueVisitors7d,
      avgEngagementSec: Math.round(
        parseFloat((week[0]?.avg_duration_ms as string) || "0") / 1000
      ),
      topSource: (referrers[0]?.source as string) ?? null,
      bounceRate,
    },
    last30Days: {
      pageviews: pageviews30d,
      uniqueVisitors: uniqueVisitors30d,
    },
    prev7Days: {
      pageviews: prevPageviews,
      uniqueVisitors: prevVisitors,
    },
    hasActivity: pageviews7d > 0 || pageviews30d > 0,
  };
}

/** Format analytics into a human-readable string for AI prompt context */
export function formatAnalyticsForPrompt(
  analytics: ProjectAnalyticsSummary,
  companyName: string
): string {
  if (!analytics.hasActivity) {
    return `${companyName}'s website has no visitor traffic yet.`;
  }

  const parts: string[] = [
    `${companyName} site analytics:`,
    `- Last 7 days: ${analytics.last7Days.pageviews} pageviews, ${analytics.last7Days.uniqueVisitors} unique visitors`,
  ];

  if (analytics.last7Days.bounceRate > 0) {
    parts.push(`- Bounce rate: ${analytics.last7Days.bounceRate}%`);
  }

  if (analytics.last7Days.avgEngagementSec > 0) {
    parts.push(
      `- Average time on site: ${analytics.last7Days.avgEngagementSec}s`
    );
  }

  if (analytics.last7Days.topSource) {
    parts.push(`- Top traffic source: ${analytics.last7Days.topSource}`);
  }

  // Week-over-week comparison
  if (analytics.prev7Days.pageviews > 0) {
    const pvDelta = analytics.last7Days.pageviews - analytics.prev7Days.pageviews;
    const pvPct = Math.round((pvDelta / analytics.prev7Days.pageviews) * 100);
    parts.push(`- Week-over-week: ${pvPct >= 0 ? "+" : ""}${pvPct}% pageviews`);
  }

  if (analytics.last30Days.pageviews !== analytics.last7Days.pageviews) {
    parts.push(
      `- Last 30 days: ${analytics.last30Days.pageviews} pageviews, ${analytics.last30Days.uniqueVisitors} unique visitors`
    );
  }

  return parts.join("\n");
}
