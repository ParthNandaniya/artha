/**
 * Growth bot runner (Twitter + Bluesky).
 *
 * Usage:
 *   npm run twitter:bot                          # post 1 item now
 *   npm run twitter:bot -- --dry-run              # generate but don't post
 *   npm run twitter:bot -- --category=showcase    # force category
 *   npm run twitter:bot -- --count=3              # post 3 items
 *   npm run twitter:bot -- --loop                 # schedule-based posting (PST times)
 *   npm run twitter:bot -- --loop --dry-run       # loop in dry-run mode
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ── Load env vars from .env.local ───────────────────────────────────

function loadEnv() {
  const envFiles = [".env.local", ".env"];
  for (const envFile of envFiles) {
    const envPath = join(process.cwd(), envFile);
    if (!existsSync(envPath)) continue;

    const content = readFileSync(envPath, "utf-8");
    content.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;

      const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) return;

      const [, key, rawValue] = match;
      if (process.env[key]) return;

      const value = rawValue.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        process.env[key] = value.slice(1, -1);
      } else {
        process.env[key] = value;
      }
    });
  }
}

loadEnv();

// ── Parse CLI args ──────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

const dryRun = args.includes("--dry-run");
const loop = args.includes("--loop");
const repliesMode = args.includes("--replies");
const outboundMode = args.includes("--outbound");
const category = getArg("category") as "showcase" | "tip" | "thread" | "article" | "founder_story" | "shorts" | "trending" | undefined;
const count = parseInt(getArg("count") || "1", 10);
const platformArg = getArg("platform") as "twitter" | "bluesky" | "all" | undefined;
const outboundPlatformArg = getArg("platform") as "twitter" | "bluesky" | "reddit" | "all" | undefined;
const maxReplies = parseInt(getArg("max") || "5", 10);

// ── PST schedule ────────────────────────────────────────────────────
// Optimal posting times in PST (America/Los_Angeles).
// Each slot posts 1 item. Randomized ±15 min to look natural.
// ~18 slots/day — heavy on trending news delivery (every ~50 min during peak hours).

const POST_SCHEDULE_PST = [
  { hour: 7,  min: 0 },   // pre-market news drop
  { hour: 7,  min: 45 },  // morning commute
  { hour: 8,  min: 30 },  // market open buzz
  { hour: 9,  min: 15 },  // mid-morning trending
  { hour: 10, min: 0 },   // mid-morning
  { hour: 10, min: 45 },  // late morning trending
  { hour: 11, min: 30 },  // pre-lunch
  { hour: 12, min: 15 },  // lunch scroll
  { hour: 13, min: 0 },   // post-lunch
  { hour: 13, min: 45 },  // early afternoon trending
  { hour: 14, min: 30 },  // afternoon
  { hour: 15, min: 15 },  // late afternoon trending
  { hour: 16, min: 0 },   // market close
  { hour: 17, min: 0 },   // end of workday
  { hour: 18, min: 0 },   // evening news
  { hour: 19, min: 0 },   // dinner scroll
  { hour: 20, min: 0 },   // prime time
  { hour: 21, min: 0 },   // late night scroll
];

// Reply check schedule — every hour during PST daytime (8 AM - 9 PM)
const REPLY_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const JITTER_MS = 15 * 60 * 1000; // ±15 min randomization

/**
 * Get current time in PST/PDT (America/Los_Angeles).
 */
function getNowPST(): Date {
  // Create a date string in LA timezone, then parse it back
  const nowStr = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
  return new Date(nowStr);
}

/**
 * Get the next scheduled post time as a real Date (in system time).
 * Finds the next slot in PST that hasn't passed yet today, or the first slot tomorrow.
 */
function getNextScheduledTime(): { date: Date; slotLabel: string } {
  const nowPST = getNowPST();
  const nowMinutes = nowPST.getHours() * 60 + nowPST.getMinutes();

  // Find next slot today
  for (const slot of POST_SCHEDULE_PST) {
    const slotMinutes = slot.hour * 60 + slot.min;
    if (slotMinutes > nowMinutes) {
      const diffMs = (slotMinutes - nowMinutes) * 60 * 1000;
      const jitter = Math.round((Math.random() - 0.5) * 2 * JITTER_MS);
      const targetDate = new Date(Date.now() + diffMs + jitter);
      const label = formatTime(slot.hour, slot.min);
      return { date: targetDate, slotLabel: label };
    }
  }

  // All slots passed today — schedule first slot tomorrow
  const firstSlot = POST_SCHEDULE_PST[0];
  const tomorrowMinutes = (24 * 60 - nowMinutes) + firstSlot.hour * 60 + firstSlot.min;
  const diffMs = tomorrowMinutes * 60 * 1000;
  const jitter = Math.round((Math.random() - 0.5) * 2 * JITTER_MS);
  const targetDate = new Date(Date.now() + diffMs + jitter);
  const label = formatTime(firstSlot.hour, firstSlot.min);
  return { date: targetDate, slotLabel: `${label} (tomorrow)` };
}

function formatTime(hour: number, min: number): string {
  const ampm = hour >= 12 ? "PM" : "AM";
  const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${h}:${min.toString().padStart(2, "0")} ${ampm} PST`;
}

// ── Run ─────────────────────────────────────────────────────────────

async function run() {
  const { runGrowthBot } = await import("../src/lib/growth/runner");

  const platformLabel = platformArg === "twitter" ? "Twitter only" : platformArg === "bluesky" ? "Bluesky only" : "Twitter + Bluesky";

  console.log("=".repeat(60));
  console.log(`Growth Bot (${platformLabel})`);
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`  Platform: ${platformLabel}`);
  console.log(`  Category: ${category || "auto"}`);
  console.log(`  Count: ${count}`);
  console.log(`  Loop: ${loop}`);
  console.log(`  Time (PST): ${getNowPST().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}`);
  console.log("=".repeat(60));

  const result = await runGrowthBot({ dryRun, category, count, platform: platformArg });

  console.log("\n" + "─".repeat(60));
  console.log("Results:");

  if (result.posted.length > 0) {
    for (const p of result.posted) {
      console.log(`  [${p.category}] ${p.topic || "—"}`);
      if (p.tweetUrls.length > 0) {
        console.log(`    Twitter: ${p.tweetUrls[0]}`);
      }
      if (p.blueskyUrls && p.blueskyUrls.length > 0) {
        console.log(`    Bluesky: ${p.blueskyUrls[0]}`);
      }
      console.log(`    Content: ${p.content.length <= 300 ? p.content : p.content.slice(0, 120) + "..."}`);
    }
  }

  if (result.skipped.length > 0) {
    console.log(`  Skipped: ${result.skipped.join(", ")}`);
  }

  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.join(", ")}`);
  }

  console.log("─".repeat(60));
  return result;
}

async function runLoop() {
  let running = true;
  let lastReplyCheck = 0; // timestamp of last reply check

  process.on("SIGINT", () => {
    console.log("\n[growth-bot] Shutting down...");
    running = false;
  });
  process.on("SIGTERM", () => {
    console.log("\n[growth-bot] Shutting down...");
    running = false;
  });

  console.log("[growth-bot] Schedule-based loop started (PST times)");
  console.log("[growth-bot] Post slots:", POST_SCHEDULE_PST.map((s) => formatTime(s.hour, s.min)).join(", "));
  if (process.env.SOCIAL_AUTO_REPLY_ENABLED !== "false") {
    console.log("[growth-bot] Reply checks: every 1 hour during 8AM-9PM PST");
  } else {
    console.log("[growth-bot] Reply checks: disabled (SOCIAL_AUTO_REPLY_ENABLED=false)");
  }
  console.log();

  /** Check replies if >=1 hour since last check */
  async function maybeCheckReplies() {
    if (process.env.SOCIAL_AUTO_REPLY_ENABLED === "false") return;

    const now = Date.now();
    if (now - lastReplyCheck < REPLY_CHECK_INTERVAL_MS) return;

    try {
      const { runReplyEngine } = await import("../src/lib/growth/reply-engine");
      console.log("\n[growth-bot] Checking for replies...");
      const replyResult = await runReplyEngine({ dryRun, maxReplies: 5, platform: platformArg });
      lastReplyCheck = Date.now();
      if (replyResult.replied > 0 || replyResult.skipped > 0) {
        console.log(`[growth-bot] Replies: ${replyResult.replied} sent, ${replyResult.skipped} skipped`);
      } else {
        console.log("[growth-bot] No new replies to process.");
      }
    } catch (err) {
      console.error("[growth-bot] Reply engine failed:", err instanceof Error ? err.message : err);
      lastReplyCheck = Date.now(); // don't retry immediately on error
    }

    // Also run outbound engine during reply checks
    if (process.env.OUTBOUND_ENGAGEMENT_ENABLED !== "false") {
      try {
        const { runOutboundEngine } = await import("../src/lib/growth/outbound-engine");
        console.log("\n[growth-bot] Running outbound engagement...");
        const outResult = await runOutboundEngine({ dryRun, maxReplies: 3, platform: "all" });
        if (outResult.replied > 0 || outResult.manual > 0) {
          console.log(`[growth-bot] Outbound: ${outResult.replied} replied, ${outResult.manual} manual, ${outResult.skipped} skipped`);
        } else {
          console.log("[growth-bot] No outbound opportunities found.");
        }
      } catch (err) {
        console.error("[growth-bot] Outbound engine failed:", err instanceof Error ? err.message : err);
      }
    }
  }

  while (running) {
    // Find next scheduled time
    const { date: nextRun, slotLabel } = getNextScheduledTime();
    const waitMs = Math.max(0, nextRun.getTime() - Date.now());

    if (waitMs > 0) {
      const waitMin = Math.round(waitMs / 60000);
      console.log(`[growth-bot] Next post at ~${slotLabel} (in ${waitMin} min). Ctrl+C to stop.`);

      // Sleep until scheduled time, but wake every 60s to check replies
      const sleepStart = Date.now();
      while (running && Date.now() - sleepStart < waitMs) {
        await new Promise((resolve) => setTimeout(resolve, 60_000));
        // Check replies every hour while waiting
        if (running) await maybeCheckReplies();
      }
    }

    if (!running) break;

    // Post new content
    try {
      await run();
    } catch (err) {
      console.error("[growth-bot] Post failed:", err instanceof Error ? err.message : err);
    }

    // Also check replies right after posting
    if (running) await maybeCheckReplies();

    // Brief pause after posting to avoid immediately scheduling the same slot
    if (running) {
      await new Promise((resolve) => setTimeout(resolve, 60_000));
    }
  }

  console.log("[growth-bot] Stopped.");
}

// ── Replies mode ─────────────────────────────────────────────────────

async function runReplies() {
  if (process.env.SOCIAL_AUTO_REPLY_ENABLED === "false") {
    console.log("[reply-engine] Auto-reply disabled (SOCIAL_AUTO_REPLY_ENABLED=false). Exiting.");
    return { processed: 0, replied: 0, skipped: 0, errors: 0, replies: [] };
  }

  const { runReplyEngine } = await import("../src/lib/growth/reply-engine");

  console.log("=".repeat(60));
  console.log("Reply Engine");
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`  Max replies: ${maxReplies}`);
  console.log("=".repeat(60));

  const result = await runReplyEngine({ dryRun, maxReplies, platform: platformArg });

  console.log("\n" + "─".repeat(60));
  console.log("Reply Results:");
  console.log(`  Processed: ${result.processed}`);
  console.log(`  Replied: ${result.replied}`);
  console.log(`  Skipped: ${result.skipped}`);
  console.log(`  Errors: ${result.errors}`);

  if (result.replies.length > 0) {
    console.log();
    for (const r of result.replies) {
      const icon = r.decision === "reply" ? "REPLY" : "SKIP";
      console.log(`  [${icon}] ${r.to}: ${r.reason}`);
      if (r.responseUrl) console.log(`    URL: ${r.responseUrl}`);
    }
  }

  console.log("─".repeat(60));
  return result;
}

// ── Outbound mode ───────────────────────────────────────────────────

async function runOutbound() {
  if (process.env.OUTBOUND_ENGAGEMENT_ENABLED === "false") {
    console.log("[outbound-engine] Outbound engagement disabled (OUTBOUND_ENGAGEMENT_ENABLED=false). Exiting.");
    return { discovered: 0, replied: 0, skipped: 0, manual: 0, errors: 0, engagements: [] };
  }

  const { runOutboundEngine } = await import("../src/lib/growth/outbound-engine");

  console.log("=".repeat(60));
  console.log("Outbound Reply Engine");
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`  Max replies: ${maxReplies}`);
  console.log(`  Platform: ${outboundPlatformArg || "all"}`);
  console.log("=".repeat(60));

  const result = await runOutboundEngine({
    dryRun,
    maxReplies,
    platform: outboundPlatformArg || "all",
  });

  console.log("\n" + "─".repeat(60));
  console.log("Outbound Results:");
  console.log(`  Discovered: ${result.discovered}`);
  console.log(`  Replied: ${result.replied}`);
  console.log(`  Manual (Reddit): ${result.manual}`);
  console.log(`  Skipped: ${result.skipped}`);
  console.log(`  Errors: ${result.errors}`);

  if (result.engagements.length > 0) {
    console.log();
    for (const e of result.engagements) {
      const icon = e.decision === "reply" ? "REPLY" : e.decision === "manual" ? "MANUAL" : "SKIP";
      console.log(`  [${icon}] ${e.platform} ${e.to}: ${e.reason}`);
      if (e.replyUrl) console.log(`    URL: ${e.replyUrl}`);
    }
  }

  console.log("─".repeat(60));
  return result;
}

// ── Entry ───────────────────────────────────────────────────────────

if (outboundMode) {
  runOutbound()
    .then((result) => {
      process.exit(result.errors > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error("[outbound-engine] Fatal:", err);
      process.exit(1);
    });
} else if (repliesMode) {
  runReplies()
    .then((result) => {
      process.exit(result.errors > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error("[reply-engine] Fatal:", err);
      process.exit(1);
    });
} else if (loop) {
  runLoop().catch((err) => {
    console.error("[growth-bot] Fatal:", err);
    process.exit(1);
  });
} else {
  run()
    .then((result) => {
      process.exit(result.errors.length > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error("[growth-bot] Fatal:", err);
      process.exit(1);
    });
}
