/**
 * Disable the social-posting crons on cron-job.org.
 *
 * Targets:
 *   - [Artha] Twitter Growth          (news engine → Twitter + Bluesky)
 *   - [Artha] Twitter Replies         (reply engine)
 *   - [Artha] Post Scheduled Content  (scheduled social_posts)
 *
 * Disables only — does not delete. Re-enable in the cron-job.org dashboard
 * or update this script to call updateCronJob({ enabled: true }).
 *
 * Usage:
 *   npx tsx scripts/disable-social-crons.ts             # disable all three
 *   npx tsx scripts/disable-social-crons.ts --dry-run   # show what would change
 */

import { readFileSync } from "fs";
import { join } from "path";

function loadEnv() {
  for (const envFile of [".env.local", ".env"]) {
    try {
      const content = readFileSync(join(process.cwd(), envFile), "utf-8");
      content.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0 && !process.env[key]) {
          process.env[key] = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
        }
      });
    } catch {}
  }
}
loadEnv();

const TARGET_TITLES = [
  "[Artha] Twitter Growth",
  "[Artha] Twitter Replies",
  "[Artha] Post Scheduled Content",
];

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const apiKey = process.env.CRONJOB_ORG_API_KEY;
  if (!apiKey) {
    console.error("Missing CRONJOB_ORG_API_KEY in env.");
    process.exit(1);
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const listRes = await fetch("https://api.cron-job.org/jobs", { headers });
  if (!listRes.ok) {
    console.error(`List failed: ${listRes.status} ${await listRes.text()}`);
    process.exit(1);
  }
  const { jobs } = (await listRes.json()) as { jobs: Array<{ jobId: number; title: string; enabled: boolean; url: string }> };

  for (const title of TARGET_TITLES) {
    const job = jobs.find((j) => j.title === title);
    if (!job) {
      console.log(`• ${title} — not found, skipping`);
      continue;
    }
    if (!job.enabled) {
      console.log(`• ${title} — already disabled (jobId ${job.jobId})`);
      continue;
    }
    if (dryRun) {
      console.log(`• ${title} — would disable (jobId ${job.jobId}) → ${job.url}`);
      continue;
    }
    const patchRes = await fetch(`https://api.cron-job.org/jobs/${job.jobId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ job: { enabled: false } }),
    });
    if (!patchRes.ok) {
      console.error(`• ${title} — FAILED: ${patchRes.status} ${await patchRes.text()}`);
      continue;
    }
    console.log(`✓ ${title} — disabled (jobId ${job.jobId})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
