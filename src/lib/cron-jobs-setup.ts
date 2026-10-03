/**
 * System cron definitions + one-time provisioning for cron-job.org.
 * Run via POST /api/admin/setup-crons after deploy.
 */

import {
  createCronJob,
  updateCronJob,
  listCronJobs,
  buildCronHeaders,
  type CronSchedule,
} from "@/lib/cron-jobs";

interface SystemCron {
  title: string;
  endpoint: string;
  schedule: Partial<CronSchedule>;
}

/** All platform system crons — these run for ALL projects */
const SYSTEM_CRONS: SystemCron[] = [
  // ── Core (run frequently) ──
  {
    title: "[Artha] Nightly Tasks",
    endpoint: "nightly-tasks",
    schedule: { hours: [0, 4, 8, 12, 16, 20], minutes: [0] }, // every 4h
  },
  {
    title: "[Artha] Morning Digest",
    endpoint: "morning-digest",
    schedule: { hours: [8], minutes: [0] }, // daily 8am
  },

  // ── Email & Outreach ──
  {
    title: "[Artha] Follow-Up Sequences",
    endpoint: "follow-up-sequences",
    schedule: { hours: [0, 4, 8, 12, 16, 20], minutes: [0] }, // every 4h
  },

  // ── Social ── (disabled — re-add entries here to provision on cron-job.org)
  // {
  //   title: "[Artha] Post Scheduled Content",
  //   endpoint: "post-scheduled-content",
  //   schedule: { hours: [-1], minutes: [0, 30] }, // every 30min
  // },
  // {
  //   title: "[Artha] Twitter Replies",
  //   endpoint: "twitter-replies",
  //   schedule: { hours: [0, 6, 12, 18], minutes: [0] }, // every 6h
  // },
  // {
  //   title: "[Artha] Twitter Growth",
  //   endpoint: "twitter-growth",
  //   schedule: { hours: [8, 14, 20], minutes: [0] }, // 3x/day: 8am, 2pm, 8pm UTC
  // },

  // ── Analytics & Intelligence ──
  {
    title: "[Artha] Analytics Actions",
    endpoint: "analytics-actions",
    schedule: { hours: [9], minutes: [0], wdays: [1] }, // weekly Monday 9am
  },
  {
    title: "[Artha] Competitive Check",
    endpoint: "competitive-check",
    schedule: { hours: [10], minutes: [0], wdays: [1] }, // weekly Monday 10am
  },
  {
    title: "[Artha] SEO Review",
    endpoint: "seo-review",
    schedule: { hours: [8], minutes: [0], mdays: [1] }, // monthly 1st at 8am
  },
  {
    title: "[Artha] A/B Test Evaluation",
    endpoint: "ab-test-evaluation",
    schedule: { hours: [0, 6, 12, 18], minutes: [0] }, // every 6h
  },

  // ── Revenue & Retention ──
  {
    title: "[Artha] Churn Monitoring",
    endpoint: "churn-monitoring",
    schedule: { hours: [7], minutes: [0] }, // daily 7am
  },
  {
    title: "[Artha] Site Nudge",
    endpoint: "site-nudge",
    schedule: { hours: [14], minutes: [0] }, // daily 2pm
  },
  {
    title: "[Artha] Subscription Broadcast",
    endpoint: "subscription-broadcast",
    schedule: { hours: [11], minutes: [0], wdays: [2] }, // weekly Tuesday 11am
  },

  // ── Content ──
  {
    title: "[Artha] Blog Publisher",
    endpoint: "blog-publisher",
    schedule: { hours: [6], minutes: [0] }, // daily 6am UTC
  },

  // ── Autonomous Orchestrator ──
  {
    title: "[Artha] Autonomous Orchestrator",
    endpoint: "autonomous-orchestrator",
    schedule: { hours: [2, 8, 14, 20], minutes: [0] }, // every 6h
  },

  // ── System Maintenance ──
  {
    title: "[Artha] Deletion Warnings",
    endpoint: "deletion-warnings",
    schedule: { hours: [10], minutes: [0] }, // daily 10am
  },
  {
    title: "[Artha] Usage Billing",
    endpoint: "usage-billing",
    schedule: { hours: [3], minutes: [0], mdays: [1] }, // monthly 1st at 3am
  },
  {
    title: "[Artha] Free Credit Refresh",
    endpoint: "free-credit-refresh",
    schedule: { hours: [1], minutes: [0], mdays: [1] }, // monthly 1st at 1am
  },
  {
    title: "[Artha] Cleanup Website DBs",
    endpoint: "cleanup-website-dbs",
    schedule: { hours: [4], minutes: [0] }, // daily 4am
  },
];

function buildFullSchedule(partial: Partial<CronSchedule>): CronSchedule {
  return {
    timezone: "UTC",
    hours: partial.hours ?? [0],
    mdays: partial.mdays ?? [-1],
    minutes: partial.minutes ?? [0],
    months: partial.months ?? [-1],
    wdays: partial.wdays ?? [-1],
    expiresAt: 0,
  };
}

/**
 * Provision all system crons on cron-job.org.
 * Creates missing crons and fixes any existing ones that point to the wrong URL
 * (e.g. localhost:3000 instead of the production domain).
 */
export async function setupSystemCrons(appUrl: string): Promise<{
  created: string[];
  updated: string[];
  skipped: string[];
  errors: string[];
}> {
  const existing = await listCronJobs();
  const existingByTitle = new Map(existing.map((j) => [j.title, j]));
  const headers = buildCronHeaders();

  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const cron of SYSTEM_CRONS) {
    const correctUrl = `${appUrl}/api/cron/${cron.endpoint}`;
    const existingJob = existingByTitle.get(cron.title);

    if (existingJob) {
      // Fix URL if it points to the wrong host (e.g. localhost)
      if (existingJob.url !== correctUrl) {
        try {
          await updateCronJob(existingJob.jobId, { url: correctUrl });
          updated.push(`${cron.title} (jobId: ${existingJob.jobId}): ${existingJob.url} -> ${correctUrl}`);
        } catch (err) {
          errors.push(
            `${cron.title}: ${err instanceof Error ? err.message : "unknown error"}`
          );
        }
      } else {
        skipped.push(cron.title);
      }
      continue;
    }

    try {
      const { jobId } = await createCronJob({
        title: cron.title,
        url: correctUrl,
        schedule: buildFullSchedule(cron.schedule),
        headers,
        enabled: true,
      });
      created.push(`${cron.title} (jobId: ${jobId})`);
    } catch (err) {
      errors.push(
        `${cron.title}: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }
  }

  return { created, updated, skipped, errors };
}
