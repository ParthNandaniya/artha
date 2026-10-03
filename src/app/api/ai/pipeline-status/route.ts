import { NextRequest, NextResponse } from "next/server";
import { verifySessionFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/neon";

const CLAIMING_STALL_SECONDS = Math.max(15, parseInt(process.env.PIPELINE_CLAIMING_STALL_SECONDS || "30", 10));
const PENDING_STALL_SECONDS = Math.max(CLAIMING_STALL_SECONDS, parseInt(process.env.PIPELINE_PENDING_STALL_SECONDS || "120", 10));

export async function GET(request: NextRequest) {
  const user = await verifySessionFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  const afterCreatedAt = request.nextUrl.searchParams.get("afterCreatedAt");
  const afterId = request.nextUrl.searchParams.get("afterId");

  const db = getDb();
  const workerConcurrency = Math.max(1, parseInt(process.env.WORKER_CONCURRENCY || "2", 10));

  const jobs = await db`
    SELECT id, status, error, created_at, started_at, completed_at, payload
    FROM job_queue
    WHERE id = ${jobId}
      AND payload->>'userId' = ${user.id}
  `;
  if (jobs.length === 0) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const job = jobs[0];

  const events = afterCreatedAt && afterId
    ? await db`
      SELECT id, step, status, log_message, log_type, data, created_at
      FROM pipeline_events
      WHERE job_id = ${jobId}
        AND (
          created_at > ${afterCreatedAt}::timestamptz
          OR (created_at = ${afterCreatedAt}::timestamptz AND id::text > ${afterId})
        )
      ORDER BY created_at ASC, id ASC
    `
    : await db`
      SELECT id, step, status, log_message, log_type, data, created_at
      FROM pipeline_events
      WHERE job_id = ${jobId}
      ORDER BY created_at ASC, id ASC
    `;

  const now = Date.now();
  const createdAtMs = new Date(job.created_at as string).getTime();
  const startedAtMs = job.started_at ? new Date(job.started_at as string).getTime() : null;
  const pendingForSeconds = job.status === "pending" ? Math.max(0, Math.floor((now - createdAtMs) / 1000)) : null;
  const runningForSeconds =
    startedAtMs && (job.status === "running" || job.status === "completed" || job.status === "failed")
      ? Math.max(0, Math.floor((now - startedAtMs) / 1000))
      : null;

  let queuePosition: number | null = null;
  let queueReason: "waiting_for_user_slot" | "waiting_for_worker_slot" | "claiming" | "worker_unavailable" | null = null;
  let queueIsStalled = false;
  let queueStalledReason: string | null = null;
  let runningCount = 0;
  let runningForUser = 0;
  if (job.status === "pending") {
    const ranked = await db`
      WITH user_pending AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            ORDER BY created_at ASC, id ASC
          ) AS position
        FROM job_queue
        WHERE status = 'pending'
          AND payload->>'userId' = ${user.id}
      )
      SELECT position
      FROM user_pending
      WHERE id = ${jobId}
    `;
    queuePosition = (ranked[0]?.position as number) ?? null;

    const running = await db`
      SELECT COUNT(*)::int AS count
      FROM job_queue
      WHERE status = 'running'
    `;
    runningCount = (running[0]?.count as number) ?? 0;

    const sameUserRunning = await db`
      SELECT COUNT(*)::int AS count
      FROM job_queue
      WHERE status = 'running'
        AND payload->>'userId' = ${user.id}
    `;
    runningForUser = (sameUserRunning[0]?.count as number) ?? 0;

    if (runningForUser > 0 || (queuePosition !== null && queuePosition > 1)) {
      queueReason = "waiting_for_user_slot";
    } else if (runningCount >= workerConcurrency) {
      queueReason = "waiting_for_worker_slot";
    } else {
      queueReason = "claiming";
    }

    if (pendingForSeconds !== null) {
      if (queueReason === "claiming" && pendingForSeconds >= CLAIMING_STALL_SECONDS) {
        queueReason = "worker_unavailable";
        queueIsStalled = true;
        queueStalledReason = `No worker claimed this job after ${pendingForSeconds}s.`;
      } else if (
        queueReason !== "waiting_for_user_slot" &&
        pendingForSeconds >= PENDING_STALL_SECONDS
      ) {
        queueIsStalled = true;
        queueStalledReason = `Job has been pending for ${pendingForSeconds}s.`;
      }
    }
  }

  const lastEvent = events.length > 0 ? events[events.length - 1] : null;

  return NextResponse.json({
    job: {
      id: job.id,
      status: job.status,
      error: job.error,
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      pendingForSeconds,
      runningForSeconds,
    },
    queue: {
      position: queuePosition,
      pendingAhead: queuePosition ? Math.max(0, queuePosition - 1) : null,
      runningCount,
      runningForUser,
      workerConcurrency,
      reason: queueReason,
      isStalled: queueIsStalled,
      stalledReason: queueStalledReason,
    },
    cursor: lastEvent
      ? { id: lastEvent.id, createdAt: lastEvent.created_at }
      : null,
    events,
  });
}
