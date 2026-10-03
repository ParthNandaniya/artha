import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import { sendWeeklyValueSummary, isTestEmailBlocked } from "@/lib/postmark";

/**
 * Weekly value summary email — sends every Monday morning.
 * Shows users exactly what Artha did for them in the past 7 days:
 * - Tasks completed
 * - Emails sent + open rate + replies
 * - Leads found
 * - Site visitors
 * - Estimated time saved
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  // Get all active projects (have a user, status is active)
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

    // Get weekly task stats
    const [taskStats] = await db`
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '7 days') AS completed_7d,
        COUNT(*) FILTER (WHERE status = 'queued') AS queued
      FROM tasks
      WHERE project_id = ${projectId}
    `;

    // Get weekly email stats
    const [emailStats] = await db`
      SELECT
        COUNT(*) FILTER (WHERE direction = 'outbound' AND created_at > NOW() - INTERVAL '7 days') AS sent_7d,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND metadata->>'opened_at' IS NOT NULL AND created_at > NOW() - INTERVAL '7 days') AS opened_7d,
        COUNT(*) FILTER (WHERE direction = 'inbound' AND created_at > NOW() - INTERVAL '7 days') AS replies_7d
      FROM email_messages
      WHERE project_id = ${projectId}
    `;

    // Get weekly lead stats
    const [leadStats] = await db`
      SELECT
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS new_leads_7d,
        COUNT(*) AS total_leads,
        COUNT(*) FILTER (WHERE status = 'replied') AS total_replied,
        COUNT(*) FILTER (WHERE status = 'converted') AS total_converted
      FROM leads
      WHERE project_id = ${projectId}
    `;

    // Get website analytics
    const [siteStats] = await db`
      SELECT
        COUNT(*) AS pageviews_7d,
        COUNT(DISTINCT visitor_id) AS visitors_7d
      FROM site_analytics
      WHERE project_id = ${projectId}
        AND created_at > NOW() - INTERVAL '7 days'
        AND event = 'pageview'
    `;

    const completed = Number(taskStats.completed_7d) || 0;
    const emailsSent = Number(emailStats.sent_7d) || 0;
    const emailsOpened = Number(emailStats.opened_7d) || 0;
    const replies = Number(emailStats.replies_7d) || 0;
    const newLeads = Number(leadStats.new_leads_7d) || 0;
    const visitors = Number(siteStats.visitors_7d) || 0;

    // Skip if nothing happened this week
    if (completed === 0 && emailsSent === 0 && newLeads === 0 && visitors === 0) {
      skipped++;
      continue;
    }

    const timeSavedHours = Math.round(completed * 0.5 + emailsSent * 0.1 + newLeads * 0.2);

    try {
      await sendWeeklyValueSummary({
        slug: project.slug as string,
        companyName: project.name as string,
        toEmail: project.email as string,
        toName: project.user_name as string | null,
        isSubscribed: project.subscription_status === "active",
        stats: {
          tasksCompleted: completed,
          tasksQueued: Number(taskStats.queued) || 0,
          emailsSent,
          emailsOpened,
          openRate: emailsSent > 0 ? Math.round((emailsOpened / emailsSent) * 100) : 0,
          replies,
          newLeads,
          totalLeads: Number(leadStats.total_leads) || 0,
          totalConverted: Number(leadStats.total_converted) || 0,
          siteVisitors: visitors,
          sitePageviews: Number(siteStats.pageviews_7d) || 0,
          timeSavedHours,
        },
      });
      sent++;
    } catch (err) {
      console.error(`[weekly-summary] Failed for ${project.slug}:`, err);
    }
  }

  return NextResponse.json({ sent, skipped, total: projects.length });
}
