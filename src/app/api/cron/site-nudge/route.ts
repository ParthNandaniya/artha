import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import { getProjectAnalyticsSummary } from "@/lib/analytics-context";
import { sendSiteActivityNudge, isTestEmailBlocked } from "@/lib/postmark";

// Minimum visitors in the past 7 days before we nudge
const MIN_VISITORS = 3;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  // Target: active projects WITHOUT an active subscription that haven't been
  // nudged in the past 6 days (so we send at most once per week)
  const projects = await db`
    SELECT
      p.id, p.name, p.slug,
      u.email AS user_email, u.name AS user_name,
      p.last_nudge_sent_at
    FROM projects p
    JOIN users u ON u.id = p.user_id
    WHERE p.status = 'active'
      AND (p.subscription_status IS NULL OR p.subscription_status NOT IN ('active', 'trialing'))
      AND (p.last_nudge_sent_at IS NULL OR p.last_nudge_sent_at < NOW() - INTERVAL '6 days')
      AND (p.is_demo IS NULL OR p.is_demo = FALSE)
      AND COALESCE(p.hidden, false) = false
      AND COALESCE(u.hidden, false) = false
  `;

  let nudged = 0;
  let skipped = 0;

  for (const project of projects) {
    // Skip test accounts (except visually-explained)
    if (isTestEmailBlocked(project.user_email as string, project.slug as string)) {
      skipped++;
      continue;
    }

    try {
      const analytics = await getProjectAnalyticsSummary(project.id as string);

      if (!analytics.hasActivity || analytics.last7Days.uniqueVisitors < MIN_VISITORS) {
        skipped++;
        continue;
      }

      await sendSiteActivityNudge({
        slug: project.slug as string,
        companyName: project.name as string,
        toEmail: project.user_email as string,
        toName: project.user_name as string | null,
        pageviews: analytics.last7Days.pageviews,
        uniqueVisitors: analytics.last7Days.uniqueVisitors,
        topSource: analytics.last7Days.topSource,
        avgEngagementSec: analytics.last7Days.avgEngagementSec,
      });

      await db`
        UPDATE projects SET last_nudge_sent_at = NOW() WHERE id = ${project.id as string}
      `;

      nudged++;
    } catch {
      // Non-fatal — continue to next project
      skipped++;
    }
  }

  return NextResponse.json({ nudged, skipped });
}
