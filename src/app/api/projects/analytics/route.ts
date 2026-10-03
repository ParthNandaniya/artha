import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";

export async function GET(request: Request) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId)
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();

  // Verify project ownership
  const projectRows = await db`
    SELECT id FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
    LIMIT 1
  `;
  if (projectRows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const daysParam = searchParams.get("days");
  const days = Math.min(Math.max(parseInt(daysParam || "30", 10), 1), 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [
    summaryRows,
    dailyRows,
    topPagesRows,
    topReferrerRows,
    topClickRows,
    deviceRows,
    sessionDurationRows,
    engagementRows,
  ] = await Promise.all([
    // Summary: total pageviews, unique visitors, unique sessions
    db`
      SELECT
        COUNT(*) FILTER (WHERE event = 'pageview') AS total_pageviews,
        COUNT(DISTINCT visitor_id) FILTER (WHERE event = 'pageview') AS unique_visitors,
        COUNT(DISTINCT session_id) FILTER (WHERE event = 'pageview') AS total_sessions
      FROM site_analytics
      WHERE project_id = ${projectId} AND created_at >= ${since}
    `,

    // Daily pageviews + visitors for chart
    db`
      SELECT
        DATE(created_at AT TIME ZONE 'UTC') AS day,
        COUNT(*) FILTER (WHERE event = 'pageview') AS pageviews,
        COUNT(DISTINCT visitor_id) FILTER (WHERE event = 'pageview') AS visitors
      FROM site_analytics
      WHERE project_id = ${projectId} AND created_at >= ${since}
      GROUP BY DATE(created_at AT TIME ZONE 'UTC')
      ORDER BY day
    `,

    // Top pages
    db`
      SELECT path, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS unique_visitors
      FROM site_analytics
      WHERE project_id = ${projectId} AND event = 'pageview' AND created_at >= ${since}
      GROUP BY path
      ORDER BY views DESC
      LIMIT 20
    `,

    // Top referrers
    db`
      SELECT
        COALESCE(NULLIF(referrer, ''), '(direct)') AS referrer,
        COUNT(*) AS count
      FROM site_analytics
      WHERE project_id = ${projectId} AND event = 'pageview' AND created_at >= ${since}
      GROUP BY COALESCE(NULLIF(referrer, ''), '(direct)')
      ORDER BY count DESC
      LIMIT 20
    `,

    // Top clicked elements
    db`
      SELECT
        metadata->>'text' AS button_text,
        metadata->>'tag' AS element_tag,
        metadata->>'href' AS href,
        COUNT(*) AS clicks
      FROM site_analytics
      WHERE project_id = ${projectId} AND event = 'click' AND created_at >= ${since}
      GROUP BY metadata->>'text', metadata->>'tag', metadata->>'href'
      ORDER BY clicks DESC
      LIMIT 20
    `,

    // Device breakdown by screen width
    db`
      SELECT
        CASE
          WHEN screen_width < 768 THEN 'mobile'
          WHEN screen_width < 1024 THEN 'tablet'
          ELSE 'desktop'
        END AS device,
        COUNT(DISTINCT visitor_id) AS visitors
      FROM site_analytics
      WHERE project_id = ${projectId} AND event = 'pageview'
        AND screen_width IS NOT NULL AND created_at >= ${since}
      GROUP BY
        CASE
          WHEN screen_width < 768 THEN 'mobile'
          WHEN screen_width < 1024 THEN 'tablet'
          ELSE 'desktop'
        END
      ORDER BY visitors DESC
    `,

    // Average session duration
    db`
      SELECT
        AVG(duration_ms) AS avg_duration_ms,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) AS median_duration_ms
      FROM site_analytics
      WHERE project_id = ${projectId} AND event = 'pageview_end'
        AND duration_ms IS NOT NULL AND created_at >= ${since}
    `,

    // Engagement: sessions with >10s engaged time OR >25% scroll depth
    db`
      SELECT COUNT(DISTINCT session_id) AS engaged_sessions
      FROM site_analytics
      WHERE project_id = ${projectId} AND event = 'pageview_end'
        AND created_at >= ${since}
        AND (
          COALESCE(duration_ms, 0) > 10000
          OR COALESCE((metadata->>'scroll_depth')::int, 0) > 25
        )
    `,
  ]);

  const totalSessions = parseInt(
    (summaryRows[0]?.total_sessions as string) || "0",
    10
  );
  const engagedSessions = parseInt(
    (engagementRows[0]?.engaged_sessions as string) || "0",
    10
  );
  const engagementRate =
    totalSessions > 0
      ? Math.round((engagedSessions / totalSessions) * 100)
      : 0;

  return NextResponse.json({
    summary: {
      totalPageviews: parseInt(
        (summaryRows[0]?.total_pageviews as string) || "0",
        10
      ),
      uniqueVisitors: parseInt(
        (summaryRows[0]?.unique_visitors as string) || "0",
        10
      ),
      totalSessions,
      avgSessionDurationMs: Math.round(
        parseFloat(
          (sessionDurationRows[0]?.avg_duration_ms as string) || "0"
        )
      ),
      medianSessionDurationMs: Math.round(
        parseFloat(
          (sessionDurationRows[0]?.median_duration_ms as string) || "0"
        )
      ),
      engagementRate,
    },
    daily: dailyRows.map((r) => ({
      day: r.day,
      pageviews: Number(r.pageviews),
      visitors: Number(r.visitors),
    })),
    topPages: topPagesRows.map((r) => ({
      path: r.path,
      views: Number(r.views),
      unique_visitors: Number(r.unique_visitors),
    })),
    topReferrers: topReferrerRows.map((r) => ({
      referrer: r.referrer,
      count: Number(r.count),
    })),
    topClicks: topClickRows.map((r) => ({
      button_text: r.button_text,
      element_tag: r.element_tag,
      href: r.href,
      clicks: Number(r.clicks),
    })),
    devices: deviceRows.map((r) => ({
      device: r.device,
      visitors: Number(r.visitors),
    })),
    dateRange: { days, since },
  });
}
