import { getDb } from "@/lib/neon";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Redact email addresses and other PII from log messages
function sanitizeLogMessage(msg: string): string {
  return msg
    .replace(/[\w.-]+@[\w.-]+\.\w+/g, "[email]")
    .replace(/neon_connection_url\s*[:=]\s*\S+/gi, "neon_connection_url=[redacted]");
}

function maskEmailsInText(text: string): string {
  return text.replace(/[\w.-]+@[\w.-]+\.\w+/g, (email) => maskEmail(email));
}

// Mask email addresses server-side so PII never reaches the frontend
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const [domainName, ...tld] = domain.split(".");
  const maskedLocal = local.length <= 2 ? `${local[0]}***` : `${local[0]}${"*".repeat(Math.min(local.length - 1, 3))}`;
  const maskedDomain = `${"*".repeat(Math.min(domainName.length, 3))}.${tld.join(".")}`;
  return `${maskedLocal}@${maskedDomain}`;
}

export async function GET() {
  try {
    const db = getDb();

    const [
      activeCompaniesResult,
      tasksCompletedResult,
      emailsSentResult,
      humanMessagesResult,
      aiActivityResult,
      runningTasksResult,
      runningJobsResult,
      recentCompaniesResult,
      recentDocumentsResult,
      recentTweetsResult,
      recentBotPostsResult,
      recentEmailsResult,
      completedTasksResult,
      totalCompaniesResult,
      totalDocumentsResult,
      totalTweetsResult,
      totalBotPostsResult,
      totalEmailsResult,
      totalTasksResult,
      recentMilestonesResult,
    ] = await Promise.all([
      // Active companies
      db`SELECT COUNT(*)::int AS count FROM projects WHERE status = 'active'`,

      // Tasks completed (30d)
      db`SELECT COUNT(*)::int AS count FROM tasks
         WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '30 days'`,

      // Emails sent (30d) — count platform emails from agents@artha.run
      db`SELECT COUNT(*)::int AS count FROM platform_email_messages
         WHERE direction = 'outbound' AND created_at > NOW() - INTERVAL '30 days'`,

      // Human messages (30d)
      db`SELECT COUNT(*)::int AS count FROM chat_messages
         WHERE role = 'user' AND created_at > NOW() - INTERVAL '30 days'`,

      // AI Activity (last 50 events, 7d — prefers recent, falls back to older)
      db`SELECT
           pe.id,
           p.name AS project_name,
           p.slug AS project_slug,
           pe.step,
           pe.log_message,
           pe.log_type,
           pe.created_at
         FROM pipeline_events pe
         JOIN job_queue jq ON jq.id = pe.job_id
         JOIN projects p ON p.id = pe.project_id
         WHERE pe.log_message IS NOT NULL
           AND pe.created_at > NOW() - INTERVAL '7 days'
         ORDER BY pe.created_at DESC
         LIMIT 50`,

      // Running tasks
      db`SELECT
           t.id,
           t.title,
           t.type,
           t.status,
           t.started_at,
           p.name AS project_name,
           p.slug AS project_slug
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         WHERE t.status = 'running'
           AND (t.started_at IS NULL OR t.started_at > NOW() - INTERVAL '4 hours')
         ORDER BY t.started_at DESC NULLS LAST
         LIMIT 20`,

      // Running/pending jobs
      db`SELECT
           jq.id,
           jq.type,
           jq.status,
           jq.started_at,
           p.name AS project_name,
           p.slug AS project_slug
         FROM job_queue jq
         JOIN projects p ON p.id = (jq.payload->>'projectId')::uuid
         WHERE jq.status IN ('running', 'pending')
           AND jq.created_at > NOW() - INTERVAL '4 hours'
         ORDER BY jq.started_at DESC NULLS LAST, jq.created_at DESC
         LIMIT 20`,

      // Recent companies
      db`SELECT
           p.name,
           p.slug,
           cp.tagline,
           p.created_at
         FROM projects p
         LEFT JOIN company_profile cp ON cp.project_id = p.id
         WHERE p.status = 'active'
           AND p.landing_page_published = TRUE
           AND COALESCE(p.hidden, false) = false
         ORDER BY p.created_at DESC
         LIMIT 6`,

      // Recent documents (no time limit — always show latest)
      db`SELECT
           d.title,
           d.type,
           p.name AS project_name,
           p.slug AS project_slug,
           d.created_at
         FROM documents d
         JOIN projects p ON p.id = d.project_id
         ORDER BY d.created_at DESC
         LIMIT 10`,

      // Recent tweets (posted only) — user launch tweets
      db`SELECT
           t.content,
           t.tweet_url,
           t.type,
           t.posted_at,
           p.name AS project_name,
           p.slug AS project_slug,
           'user' AS source
         FROM tweets t
         JOIN projects p ON p.id = t.project_id
         WHERE t.status = 'posted' AND t.posted_at IS NOT NULL
         ORDER BY t.posted_at DESC
         LIMIT 10`,

      // Recent bot posts (from @tryarthaHQ growth bot)
      db`SELECT
           bp.content,
           bp.tweet_urls,
           bp.category,
           bp.posted_at,
           bp.metadata,
           p.name AS project_name,
           p.slug AS project_slug
         FROM twitter_bot_posts bp
         LEFT JOIN projects p ON p.id = bp.project_id
         WHERE bp.status = 'posted' AND bp.posted_at IS NOT NULL
         ORDER BY bp.posted_at DESC
         LIMIT 10`,

      // Recent outbound platform emails (from agents@artha.run)
      db`SELECT
           pem.subject,
           pem.to_email,
           pem.from_email,
           pem.created_at
         FROM platform_email_messages pem
         WHERE pem.direction = 'outbound'
         ORDER BY pem.created_at DESC
         LIMIT 10`,

      // Recently completed tasks (fallback when none running)
      db`SELECT
           t.id,
           t.title,
           t.type,
           t.status,
           t.started_at,
           t.completed_at,
           p.name AS project_name,
           p.slug AS project_slug
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         WHERE t.status = 'completed'
         ORDER BY t.completed_at DESC NULLS LAST
         LIMIT 10`,

      // Total counts for headers
      db`SELECT COUNT(*)::int AS count FROM projects WHERE status = 'active' AND landing_page_published = TRUE AND COALESCE(hidden, false) = false`,
      db`SELECT COUNT(*)::int AS count FROM documents`,
      db`SELECT COUNT(*)::int AS count FROM tweets WHERE status = 'posted'`,
      db`SELECT COUNT(*)::int AS count FROM twitter_bot_posts WHERE status = 'posted'`,
      db`SELECT COUNT(*)::int AS count FROM platform_email_messages WHERE direction = 'outbound'`,
      db`SELECT COUNT(*)::int AS count FROM tasks`,

      // Recent milestones (social proof)
      db`SELECT m.type, m.title, m.amount_cents, m.created_at, p.name AS project_name, p.slug AS project_slug
         FROM milestones m
         JOIN projects p ON p.id = m.project_id
         WHERE m.is_public = TRUE
         ORDER BY m.created_at DESC
         LIMIT 10`,

    ]);

    // Merge running tasks and running jobs into a unified list
    const runningTasks = [
      ...runningTasksResult.map((r: Record<string, unknown>) => ({
        id: r.id,
        title: maskEmailsInText(String(r.title ?? "")),
        type: r.type,
        status: r.status,
        startedAt: r.started_at,
        projectName: r.project_name,
        projectSlug: r.project_slug,
        source: "task" as const,
      })),
      ...runningJobsResult.map((r: Record<string, unknown>) => ({
        id: r.id,
        title: `${r.type}`.replace(/_/g, " "),
        type: r.type,
        status: r.status,
        startedAt: r.started_at,
        projectName: r.project_name,
        projectSlug: r.project_slug,
        source: "job" as const,
      })),
    ];

    // Merge user tweets and bot posts into a unified social feed
    const userTweets = recentTweetsResult.map((r: Record<string, unknown>) => ({
      content: String(r.content ?? ""),
      tweetUrl: r.tweet_url as string | null,
      blueskyUrl: null as string | null,
      type: r.type as string,
      postedAt: r.posted_at as string,
      projectName: r.project_name as string,
      projectSlug: r.project_slug as string,
      source: "user" as const,
    }));

    const botPosts = recentBotPostsResult.map((r: Record<string, unknown>) => {
      const urls = (r.tweet_urls as string[]) || [];
      const twitterUrl = urls.find((u) => u.includes("x.com") || u.includes("twitter.com")) ?? null;
      const blueskyUrl = urls.find((u) => u.includes("bsky.app")) ?? null;
      return {
        content: String(r.content ?? ""),
        tweetUrl: twitterUrl,
        blueskyUrl,
        type: r.category as string,
        postedAt: r.posted_at as string,
        projectName: (r.project_name as string) ?? "Artha",
        projectSlug: (r.project_slug as string) ?? "",
        source: "bot" as const,
      };
    });

    // Merge and sort by posted date, most recent first
    const allSocialPosts = [...userTweets, ...botPosts]
      .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())
      .slice(0, 15);

    const data = {
      metrics: {
        activeCompanies: activeCompaniesResult[0]?.count ?? 0,
        tasksCompleted: tasksCompletedResult[0]?.count ?? 0,
        emailsSent: emailsSentResult[0]?.count ?? 0,
        humanMessages: humanMessagesResult[0]?.count ?? 0,
      },
      aiActivity: aiActivityResult.map((r: Record<string, unknown>) => ({
        id: r.id,
        projectName: r.project_name,
        projectSlug: r.project_slug,
        step: r.step,
        logMessage: sanitizeLogMessage(String(r.log_message ?? "")),
        logType: r.log_type,
        createdAt: r.created_at,
      })),
      runningTasks,
      completedTasks: completedTasksResult.map((r: Record<string, unknown>) => ({
        id: r.id,
        title: maskEmailsInText(String(r.title ?? "")),
        type: r.type,
        status: r.status,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        projectName: r.project_name,
        projectSlug: r.project_slug,
      })),
      recentCompanies: recentCompaniesResult.map((r: Record<string, unknown>) => ({
        name: r.name,
        slug: r.slug,
        tagline: r.tagline,
        createdAt: r.created_at,
      })),
      recentDocuments: recentDocumentsResult.map((r: Record<string, unknown>) => ({
        title: r.title,
        type: r.type,
        projectName: r.project_name,
        projectSlug: r.project_slug,
        createdAt: r.created_at,
      })),
      recentTweets: allSocialPosts,
      recentEmails: recentEmailsResult.map((r: Record<string, unknown>) => ({
        subject: sanitizeLogMessage(String(r.subject ?? "")),
        toEmail: r.to_email ? maskEmail(String(r.to_email)) : undefined,
        fromEmail: r.from_email ? String(r.from_email) : undefined,
        createdAt: r.created_at,
      })),
      milestones: recentMilestonesResult.map((r: Record<string, unknown>) => ({
        type: r.type,
        title: r.title,
        amountCents: r.amount_cents,
        projectName: r.project_name,
        projectSlug: r.project_slug,
        createdAt: r.created_at,
      })),
      totals: {
        companies: totalCompaniesResult[0]?.count ?? 0,
        documents: totalDocumentsResult[0]?.count ?? 0,
        tweets: (totalTweetsResult[0]?.count ?? 0) + (totalBotPostsResult[0]?.count ?? 0),
        emails: totalEmailsResult[0]?.count ?? 0,
        tasks: totalTasksResult[0]?.count ?? 0,
      },
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=10, stale-while-revalidate=30",
      },
    });
  } catch (error) {
    console.error("[/api/live] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch live data" },
      { status: 500 }
    );
  }
}
