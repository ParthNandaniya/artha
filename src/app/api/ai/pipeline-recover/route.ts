import { NextResponse } from "next/server";
import { verifySessionFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import {
  cancelPendingPipelineJobsForUser,
  createRunningPipelineJob,
  findRunningPipelineJobForUser,
  startPipelineJobInBackground,
} from "@/lib/pipeline-jobs";

export const runtime = "nodejs";

type RecoveryAction = "retry" | "run_now";

function parsePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function parseRetryCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function POST(request: Request) {
  const user = await verifySessionFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { jobId?: unknown; action?: unknown };
  try {
    body = (await request.json()) as { jobId?: unknown; action?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  const action = body.action as RecoveryAction;
  if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  if (action !== "retry" && action !== "run_now") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const db = getDb();
  const jobs = await db`
    SELECT id, status, payload
    FROM job_queue
    WHERE id = ${jobId}
      AND payload->>'userId' = ${user.id}
    LIMIT 1
  `;
  if (jobs.length === 0) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const job = jobs[0] as {
    id: string;
    status: "pending" | "running" | "completed" | "failed";
    payload: unknown;
  };
  const payload = parsePayload(job.payload);

  if (action === "retry") {
    if (job.status === "running") {
      return NextResponse.json({ error: "This job is already running. Wait for it or use Refresh." }, { status: 409 });
    }
    if (job.status === "completed") {
      return NextResponse.json({ error: "This job already completed." }, { status: 409 });
    }

    if (job.status === "pending") {
      const cancelled = await db`
        UPDATE job_queue
        SET status = 'failed',
            error = 'Cancelled by manual retry request.',
            completed_at = NOW()
        WHERE id = ${jobId}
          AND status = 'pending'
        RETURNING id
      `;
      if (cancelled.length === 0) {
        return NextResponse.json({ error: "Job changed state before retry. Refresh and try again." }, { status: 409 });
      }
    }

    const otherRunningJobId = await findRunningPipelineJobForUser(user.id, jobId);
    if (otherRunningJobId) {
      return NextResponse.json(
        {
          error: "Another company build is already running for your account. Reconnecting to it now.",
          jobId: otherRunningJobId,
          status: "running",
        },
        { status: 409 }
      );
    }

    await cancelPendingPipelineJobsForUser(
      user.id,
      "Cancelled by retry request in favor of a fresh company build.",
      jobId
    );

    const retryPayload = {
      ...payload,
      queuedBy: "manual_recovery",
      retriedFromJobId: jobId,
      retryCount: parseRetryCount(payload.retryCount) + 1,
    };

    const nextJobId = await createRunningPipelineJob(retryPayload);
    startPipelineJobInBackground(nextJobId, retryPayload);

    return NextResponse.json({
      jobId: nextJobId,
      status: "running",
      previousJobId: jobId,
      message: "Started a fresh pipeline job with the same prompt.",
    });
  }

  if (job.status === "completed") {
    return NextResponse.json({ error: "This job already completed." }, { status: 409 });
  }
  if (job.status === "failed") {
    return NextResponse.json({ error: "This job already failed. Use Retry Job instead." }, { status: 409 });
  }
  if (job.status === "running") {
    return NextResponse.json({
      jobId,
      status: "running",
      manuallyExecuted: false,
      message: "Job is already running.",
    });
  }

  const otherRunningJobId = await findRunningPipelineJobForUser(user.id, jobId);
  if (otherRunningJobId) {
    return NextResponse.json(
      {
        error: "Another company build is already running for your account. Reconnecting to it now.",
        jobId: otherRunningJobId,
        status: "running",
      },
      { status: 409 }
    );
  }

  await cancelPendingPipelineJobsForUser(
    user.id,
    "Cancelled in favor of a manually started company build.",
    jobId
  );

  const claimed = await db`
    UPDATE job_queue
    SET status = 'running',
        started_at = COALESCE(started_at, NOW()),
        error = NULL
    WHERE id = ${jobId}
      AND status = 'pending'
    RETURNING payload
  `;
  if (claimed.length === 0) {
    return NextResponse.json(
      { error: "Job was already claimed. Refresh to see current status." },
      { status: 409 }
    );
  }

  const claimedPayload = parsePayload(claimed[0].payload);
  startPipelineJobInBackground(jobId, claimedPayload);

  return NextResponse.json({
    jobId,
    status: "running",
    manuallyExecuted: true,
    message: "Manual execution started.",
  });
}
