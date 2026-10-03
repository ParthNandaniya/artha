import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import { sendMorningDigest, isTestEmailBlocked } from "@/lib/postmark";

/**
 * Morning digest cron — runs daily at 8am UTC.
 * Sends each active subscribed project's founder a summary of:
 * - Tasks completed in the last 24 hours
 * - Upcoming queued tasks
 * - Site analytics (7-day window)
 * - Inbound emails and new leads
 * - Revenue stats (if applicable)
 *
 * The email is reply-able — founder replies route through the
 * existing Postmark inbound webhook → orchestrateEmail() pipeline.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  const projects = await db`
    SELECT p.id, p.slug, p.name, p.user_id, p.subscription_status,
           u.email, u.name AS user_name
    FROM projects p
    JOIN users u ON u.id = p.user_id
    WHERE p.status = 'active'
      AND u.email IS NOT NULL
      AND (p.is_demo IS NULL OR p.is_demo = FALSE)
      AND COALESCE(p.hidden, false) = false
      AND COALESCE(u.hidden, false) = false
  `;

  let sent = 0;
  let skipped = 0;

  for (const project of projects) {
    // Skip test accounts (except visually-explained)
    if (isTestEmailBlocked(project.email as string, project.slug as string)) {
      skipped++;
      continue;
    }

    const projectId = project.id as string;

    try {
      // Tasks completed in last 24 hours
      const completedTasks = await db`
        SELECT title, COALESCE(result_summary, '') AS summary
        FROM tasks
        WHERE project_id = ${projectId}
          AND status = 'completed'
          AND completed_at > NOW() - INTERVAL '24 hours'
        ORDER BY completed_at DESC
        LIMIT 10
      `;

      // Upcoming queued tasks
      const upcomingTasks = await db`
        SELECT title
        FROM tasks
        WHERE project_id = ${projectId}
          AND status = 'queued'
        ORDER BY priority DESC NULLS LAST, created_at ASC
        LIMIT 5
      `;

      // Site analytics (7-day window)
      const [siteStats] = await db`
        SELECT
          COUNT(*) AS pageviews,
          COUNT(DISTINCT visitor_id) AS unique_visitors,
          COALESCE(AVG(NULLIF((metadata->>'engagementTime')::int, 0)), 0)::int AS avg_engagement_sec
        FROM site_analytics
        WHERE project_id = ${projectId}
          AND created_at > NOW() - INTERVAL '7 days'
          AND event = 'pageview'
      `;

      // Top referrer source
      const topSourceRows = await db`
        SELECT metadata->>'referrer' AS source, COUNT(*) AS cnt
        FROM site_analytics
        WHERE project_id = ${projectId}
          AND created_at > NOW() - INTERVAL '7 days'
          AND event = 'pageview'
          AND metadata->>'referrer' IS NOT NULL
          AND metadata->>'referrer' != ''
        GROUP BY source
        ORDER BY cnt DESC
        LIMIT 1
      `;

      // Inbound emails in last 24h
      const [emailStats] = await db`
        SELECT COUNT(*) AS received
        FROM email_messages
        WHERE project_id = ${projectId}
          AND direction = 'inbound'
          AND created_at > NOW() - INTERVAL '24 hours'
      `;

      // New leads in last 24h
      const [leadStats] = await db`
        SELECT COUNT(*) AS new_leads
        FROM leads
        WHERE project_id = ${projectId}
          AND created_at > NOW() - INTERVAL '24 hours'
      `;

      // Revenue (if Stripe connected)
      const revenueRows = await db`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active') AS active_subscribers,
          COALESCE(SUM(CASE WHEN status = 'active' THEN amount_cents ELSE 0 END), 0) AS mrr_cents
        FROM subscriptions
        WHERE project_id = ${projectId}
      `;
      const revRow = revenueRows[0];

      const completed = completedTasks.map((t) => ({
        title: t.title as string,
        summary: t.summary as string,
      }));
      const upcoming = upcomingTasks.map((t) => ({ title: t.title as string }));
      const emailsReceived = Number(emailStats.received) || 0;
      const leadsFound = Number(leadStats.new_leads) || 0;
      const visitors = Number(siteStats.unique_visitors) || 0;

      // Skip if absolutely nothing happened and no upcoming tasks
      if (completed.length === 0 && upcoming.length === 0 && visitors === 0 && emailsReceived === 0 && leadsFound === 0) {
        skipped++;
        continue;
      }

      await sendMorningDigest({
        slug: project.slug as string,
        companyName: project.name as string,
        toEmail: project.email as string,
        toName: project.user_name as string | null,
        tasksCompleted: completed,
        tasksUpcoming: upcoming,
        analytics: visitors > 0 ? {
          pageviews: Number(siteStats.pageviews) || 0,
          uniqueVisitors: visitors,
          avgEngagementSec: Number(siteStats.avg_engagement_sec) || 0,
          topSource: (topSourceRows[0]?.source as string) || null,
        } : undefined,
        revenue: Number(revRow?.active_subscribers) > 0 ? {
          activeSubscribers: Number(revRow.active_subscribers),
          mrrCents: Number(revRow.mrr_cents),
        } : undefined,
        emailsReceived,
        leadsFound,
      });
      sent++;
    } catch (err) {
      console.error(`[morning-digest] Failed for ${project.slug}:`, err);
    }
  }

  return NextResponse.json({ sent, skipped, total: projects.length });
}
