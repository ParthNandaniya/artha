import type { Metadata } from "next";
import { getDb } from "@/lib/neon";
import { LiveDashboard } from "@/components/live/live-dashboard";
import type { LiveDashboardData } from "@/hooks/use-live-dashboard";

export const dynamic = "force-dynamic";

function sanitizeLogMessage(msg: string): string {
  return msg
    .replace(/[\w.-]+@[\w.-]+\.\w+/g, "[email]")
    .replace(/neon_connection_url\s*[:=]\s*\S+/gi, "neon_connection_url=[redacted]");
}

function maskEmailsInText(text: string): string {
  return text.replace(/[\w.-]+@[\w.-]+\.\w+/g, (email) => maskEmail(email));
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const [domainName, ...tld] = domain.split(".");
  const maskedLocal = local.length <= 2 ? `${local[0]}***` : `${local[0]}${"*".repeat(Math.min(local.length - 1, 3))}`;
  const maskedDomain = `${"*".repeat(Math.min(domainName.length, 3))}.${tld.join(".")}`;
  return `${maskedLocal}@${maskedDomain}`;
}

export const metadata: Metadata = {
  title: "Artha Live — Watch AI Build Companies in Real Time",
  description:
    "See Artha running live. AI building companies, executing tasks, sending emails, and posting tweets — all automatically.",
  openGraph: {
    title: "Artha Live — Watch AI Build Companies in Real Time",
    description:
      "See Artha running live. AI building companies, executing tasks, sending emails, and posting tweets — all automatically.",
  },
};

async function getLiveDashboardData(): Promise<LiveDashboardData> {
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
  ] = await Promise.all([
    db`SELECT COUNT(*)::int AS count FROM projects WHERE status = 'active'`,
    db`SELECT COUNT(*)::int AS count FROM tasks
       WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '30 days'`,
    // Platform emails from agents@artha.run
    db`SELECT COUNT(*)::int AS count FROM platform_email_messages
       WHERE direction = 'outbound' AND created_at > NOW() - INTERVAL '30 days'`,
    db`SELECT COUNT(*)::int AS count FROM chat_messages
       WHERE role = 'user' AND created_at > NOW() - INTERVAL '30 days'`,
    db`SELECT pe.id, p.name AS project_name, p.slug AS project_slug,
              pe.step, pe.log_message, pe.log_type, pe.created_at
       FROM pipeline_events pe
       JOIN job_queue jq ON jq.id = pe.job_id
       JOIN projects p ON p.id = pe.project_id
       WHERE pe.log_message IS NOT NULL
         AND pe.created_at > NOW() - INTERVAL '7 days'
       ORDER BY pe.created_at DESC
       LIMIT 50`,
    db`SELECT t.id, t.title, t.type, t.status, t.started_at,
              p.name AS project_name, p.slug AS project_slug
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       WHERE t.status = 'running'
         AND (t.started_at IS NULL OR t.started_at > NOW() - INTERVAL '4 hours')
       ORDER BY t.started_at DESC NULLS LAST
       LIMIT 20`,
    db`SELECT jq.id, jq.type, jq.status, jq.started_at,
              p.name AS project_name, p.slug AS project_slug
       FROM job_queue jq
       JOIN projects p ON p.id = (jq.payload->>'projectId')::uuid
       WHERE jq.status IN ('running', 'pending')
         AND jq.created_at > NOW() - INTERVAL '4 hours'
       ORDER BY jq.started_at DESC NULLS LAST, jq.created_at DESC
       LIMIT 20`,
    db`SELECT p.name, p.slug, cp.tagline, p.created_at
       FROM projects p
       LEFT JOIN company_profile cp ON cp.project_id = p.id
       WHERE p.status = 'active' AND p.landing_page_published = TRUE AND COALESCE(p.hidden, false) = false
       ORDER BY p.created_at DESC
       LIMIT 6`,
    db`SELECT d.title, d.type, p.name AS project_name, p.slug AS project_slug, d.created_at
       FROM documents d
       JOIN projects p ON p.id = d.project_id
       ORDER BY d.created_at DESC
       LIMIT 10`,
    // User launch tweets
    db`SELECT t.content, t.tweet_url, t.type, t.posted_at,
              p.name AS project_name, p.slug AS project_slug
       FROM tweets t
       JOIN projects p ON p.id = t.project_id
       WHERE t.status = 'posted' AND t.posted_at IS NOT NULL
       ORDER BY t.posted_at DESC
       LIMIT 10`,
    // Bot posts
    db`SELECT bp.content, bp.tweet_urls, bp.category, bp.posted_at, bp.metadata,
              p.name AS project_name, p.slug AS project_slug
       FROM twitter_bot_posts bp
       LEFT JOIN projects p ON p.id = bp.project_id
       WHERE bp.status = 'posted' AND bp.posted_at IS NOT NULL
       ORDER BY bp.posted_at DESC
       LIMIT 10`,
    // Platform emails from agents@artha.run
    db`SELECT pem.subject, pem.to_email, pem.from_email, pem.created_at
       FROM platform_email_messages pem
       WHERE pem.direction = 'outbound'
       ORDER BY pem.created_at DESC
       LIMIT 10`,
    // Completed tasks
    db`SELECT t.id, t.title, t.type, t.status, t.started_at, t.completed_at,
              p.name AS project_name, p.slug AS project_slug
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       WHERE t.status = 'completed'
       ORDER BY t.completed_at DESC NULLS LAST
       LIMIT 10`,
    db`SELECT COUNT(*)::int AS count FROM projects WHERE status = 'active' AND landing_page_published = TRUE AND COALESCE(hidden, false) = false`,
    db`SELECT COUNT(*)::int AS count FROM documents`,
    db`SELECT COUNT(*)::int AS count FROM tweets WHERE status = 'posted'`,
    db`SELECT COUNT(*)::int AS count FROM twitter_bot_posts WHERE status = 'posted'`,
    db`SELECT COUNT(*)::int AS count FROM platform_email_messages WHERE direction = 'outbound'`,
    db`SELECT COUNT(*)::int AS count FROM tasks`,
  ]);

  const runningTasks = [
    ...runningTasksResult.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      title: maskEmailsInText(String(r.title)),
      type: r.type ? String(r.type) : null,
      status: String(r.status),
      startedAt: r.started_at ? String(r.started_at) : null,
      projectName: String(r.project_name),
      projectSlug: String(r.project_slug),
      source: "task" as const,
    })),
    ...runningJobsResult.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      title: String(r.type).replace(/_/g, " "),
      type: r.type ? String(r.type) : null,
      status: String(r.status),
      startedAt: r.started_at ? String(r.started_at) : null,
      projectName: String(r.project_name),
      projectSlug: String(r.project_slug),
      source: "job" as const,
    })),
  ];

  // Merge user tweets and bot posts
  const userTweets = recentTweetsResult.map((r: Record<string, unknown>) => ({
    content: String(r.content),
    tweetUrl: r.tweet_url ? String(r.tweet_url) : null,
    blueskyUrl: null as string | null,
    type: String(r.type),
    postedAt: String(r.posted_at),
    projectName: String(r.project_name),
    projectSlug: String(r.project_slug),
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
      type: String(r.category),
      postedAt: String(r.posted_at),
      projectName: r.project_name ? String(r.project_name) : "Artha",
      projectSlug: r.project_slug ? String(r.project_slug) : "",
      source: "bot" as const,
    };
  });

  const allSocialPosts = [...userTweets, ...botPosts]
    .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())
    .slice(0, 15);

  return {
    metrics: {
      activeCompanies: (activeCompaniesResult[0]?.count as number) ?? 0,
      tasksCompleted: (tasksCompletedResult[0]?.count as number) ?? 0,
      emailsSent: (emailsSentResult[0]?.count as number) ?? 0,
      humanMessages: (humanMessagesResult[0]?.count as number) ?? 0,
    },
    aiActivity: aiActivityResult.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      projectName: String(r.project_name),
      projectSlug: String(r.project_slug),
      step: String(r.step),
      logMessage: sanitizeLogMessage(String(r.log_message ?? "")),
      logType: String(r.log_type),
      createdAt: String(r.created_at),
    })),
    runningTasks,
    completedTasks: completedTasksResult.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      title: maskEmailsInText(String(r.title)),
      type: r.type ? String(r.type) : null,
      status: String(r.status),
      startedAt: r.started_at ? String(r.started_at) : null,
      completedAt: r.completed_at ? String(r.completed_at) : null,
      projectName: String(r.project_name),
      projectSlug: String(r.project_slug),
    })),
    recentCompanies: recentCompaniesResult.map((r: Record<string, unknown>) => ({
      name: String(r.name),
      slug: String(r.slug),
      tagline: r.tagline ? String(r.tagline) : null,
      createdAt: String(r.created_at),
    })),
    recentDocuments: recentDocumentsResult.map((r: Record<string, unknown>) => ({
      title: String(r.title),
      type: String(r.type),
      projectName: String(r.project_name),
      projectSlug: String(r.project_slug),
      createdAt: String(r.created_at),
    })),
    recentTweets: allSocialPosts,
    recentEmails: recentEmailsResult.map((r: Record<string, unknown>) => ({
      subject: sanitizeLogMessage(String(r.subject ?? "")),
      toEmail: r.to_email ? maskEmail(String(r.to_email)) : undefined,
      fromEmail: r.from_email ? String(r.from_email) : undefined,
      createdAt: String(r.created_at),
    })),
    totals: {
      companies: (totalCompaniesResult[0]?.count as number) ?? 0,
      documents: (totalDocumentsResult[0]?.count as number) ?? 0,
      tweets:
        ((totalTweetsResult[0]?.count as number) ?? 0) +
        ((totalBotPostsResult[0]?.count as number) ?? 0),
      emails: (totalEmailsResult[0]?.count as number) ?? 0,
      tasks: (totalTasksResult[0]?.count as number) ?? 0,
    },
    generatedAt: new Date().toISOString(),
  };
}

export default async function LivePage() {
  const data = await getLiveDashboardData();
  return <LiveDashboard initialData={data} />;
}
