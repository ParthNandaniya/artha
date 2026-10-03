import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { neon } from "@neondatabase/serverless";
import { processPipelineJob } from "./processors/pipeline";
import { processTaskJob } from "./processors/tasks";
import { processEmailJob } from "./processors/email";
import { processGenerateTasksJob } from "./processors/generate-tasks";
import { processArthaOpsJob } from "./processors/artha-ops";

function loadWorkerEnv() {
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

loadWorkerEnv();

const POLL_INTERVAL = parseInt(process.env.WORKER_POLL_INTERVAL || "2000", 10);
const WORKER_CONCURRENCY = Math.max(1, parseInt(process.env.WORKER_CONCURRENCY || "2", 10));
const RUNNING_STALL_SECONDS = Math.max(60, parseInt(process.env.WORKER_RUNNING_STALL_SECONDS || "600", 10));
const RUNNING_MAX_SECONDS = Math.max(RUNNING_STALL_SECONDS, parseInt(process.env.WORKER_RUNNING_MAX_SECONDS || "1800", 10));
const STALLED_SWEEP_INTERVAL_MS = Math.max(5000, parseInt(process.env.WORKER_STALLED_SWEEP_INTERVAL_MS || "15000", 10));
let running = true;
let lastStalledSweepAt = 0;

function getDb() {
  return neon(process.env.DATABASE_URL!);
}

async function claimJob() {
  const db = getDb();
  const rows = await db`
    WITH candidate AS (
      SELECT j.id
      FROM job_queue j
      WHERE j.status = 'pending'
        AND (
          COALESCE(j.payload->>'userId', '') = ''
          OR j.id = (
            SELECT j2.id
            FROM job_queue j2
            WHERE j2.status = 'pending'
              AND j2.payload->>'userId' = j.payload->>'userId'
            ORDER BY j2.created_at ASC, j2.id ASC
            LIMIT 1
          )
        )
        AND (
          COALESCE(j.payload->>'userId', '') = ''
          OR NOT EXISTS (
            SELECT 1
            FROM job_queue r
            WHERE r.status = 'running'
              AND r.payload->>'userId' = j.payload->>'userId'
          )
        )
      ORDER BY j.created_at ASC, j.id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE job_queue j
    SET status = 'running', started_at = NOW(), error = NULL
    FROM candidate
    WHERE j.id = candidate.id
    RETURNING j.*
  `;
  return rows.length > 0 ? rows[0] : null;
}

async function completeJob(jobId: string) {
  const db = getDb();
  await db`
    UPDATE job_queue
    SET status = 'completed', completed_at = NOW()
    WHERE id = ${jobId}
      AND status = 'running'
  `;
}

async function failJob(jobId: string, error: string) {
  const db = getDb();
  await db`
    UPDATE job_queue
    SET status = 'failed', error = ${error}, completed_at = NOW()
    WHERE id = ${jobId}
      AND status = 'running'
  `;
}

async function markTaskFailedForStalledJob(
  payload: Record<string, unknown>,
  reason: string
) {
  const projectId = typeof payload.projectId === "string" ? payload.projectId : null;
  const taskId = typeof payload.taskId === "string" ? payload.taskId : null;
  if (!projectId || !taskId) return;

  const db = getDb();
  await db`
    UPDATE tasks
    SET status = 'failed', summary = ${reason}, completed_at = NOW()
    WHERE project_id = ${projectId}
      AND id = ${taskId}
      AND status = 'running'
  `;
}

async function reapStalledJobs() {
  const db = getDb();
  const rows = await db`
    SELECT j.id, j.type, j.payload, j.started_at, pe.last_event_at
    FROM job_queue j
    LEFT JOIN LATERAL (
      SELECT MAX(created_at) AS last_event_at
      FROM pipeline_events
      WHERE job_id = j.id
    ) pe ON TRUE
    WHERE j.status = 'running'
      AND (
        j.started_at < NOW() - (${RUNNING_MAX_SECONDS} * INTERVAL '1 second')
        OR (
          j.type = 'run_pipeline'
          AND COALESCE(pe.last_event_at, j.started_at) < NOW() - (${RUNNING_STALL_SECONDS} * INTERVAL '1 second')
        )
      )
    ORDER BY j.started_at ASC
    LIMIT 25
  `;

  for (const row of rows) {
    const jobId = row.id as string;
    const jobType = row.type as string;
    const payload = (row.payload || {}) as Record<string, unknown>;
    const reason =
      jobType === "run_pipeline"
        ? `Pipeline stalled (no progress for ${RUNNING_STALL_SECONDS}s). Marked failed so next request can continue.`
        : `Job exceeded max runtime (${RUNNING_MAX_SECONDS}s). Marked failed so next request can continue.`;

    if (jobType === "run_task") {
      try {
        await markTaskFailedForStalledJob(payload, reason);
      } catch (err) {
        console.error(`[worker] Failed to mark stalled task failed for job ${jobId}:`, err);
      }
    }

    await failJob(jobId, reason);
    console.warn(`[worker] Reaped stalled job ${jobId} (${jobType})`);
  }
}

async function processJob(job: Record<string, unknown>) {
  const jobId = job.id as string;
  const jobType = job.type as string;
  const payload = job.payload as Record<string, unknown>;

  console.log(`[worker] Processing job ${jobId} (${jobType})`);

  try {
    switch (jobType) {
      case "run_pipeline":
        await processPipelineJob(jobId, payload);
        break;
      case "run_task":
        await processTaskJob(jobId, payload);
        break;
      case "send_email":
        await processEmailJob(jobId, "send", payload);
        break;
      case "generate_tasks":
        await processGenerateTasksJob(jobId, payload);
        break;
      case "artha_ops":
        await processArthaOpsJob(jobId, payload);
        break;
      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }
    await completeJob(jobId);
    console.log(`[worker] Job ${jobId} completed`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Job ${jobId} failed: ${errorMsg}`);
    await failJob(jobId, errorMsg);
  }
}

async function poll(workerId: number) {
  while (running) {
    try {
      const now = Date.now();
      if (now - lastStalledSweepAt >= STALLED_SWEEP_INTERVAL_MS) {
        lastStalledSweepAt = now;
        await reapStalledJobs();
      }

      const job = await claimJob();
      if (job) {
        console.log(`[worker:${workerId}] Claimed job ${String(job.id)}`);
        await processJob(job);
      } else {
        await sleep(POLL_INTERVAL);
      }
    } catch (err) {
      console.error(`[worker:${workerId}] Poll error:`, err);
      await sleep(POLL_INTERVAL * 2);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

process.on("SIGTERM", () => {
  console.log("[worker] Shutting down...");
  running = false;
});

process.on("SIGINT", () => {
  console.log("[worker] Shutting down...");
  running = false;
});

console.log(`[worker] Starting (${WORKER_CONCURRENCY} workers, poll interval: ${POLL_INTERVAL}ms)`);
Promise.all(
  Array.from({ length: WORKER_CONCURRENCY }, (_, i) => poll(i + 1))
).catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
