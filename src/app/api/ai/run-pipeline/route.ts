import { NextResponse } from "next/server";
import { verifySessionFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import {
  cancelPendingPipelineJobsForUser,
  createRunningPipelineJob,
  findRunningPipelineJobForUser,
  startPipelineJobInBackground,
} from "@/lib/pipeline-jobs";
import { RunPipelineSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await verifySessionFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json();
  const parsed = parseBody(RunPipelineSchema, raw);
  if (!parsed.success) return parsed.response;
  const { prompt, url } = parsed.data;

  const db = getDb();
  const existingProjects = await db`
    SELECT id, subscription_status FROM projects
    WHERE user_id = ${user.id}
  `;
  const isFirstCompany = existingProjects.length === 0;

  // Limit: max 3 companies without an active subscription (bypass for admin)
  const MAX_FREE_PROJECTS = 3;
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = !!user.email && adminEmails.includes(user.email.toLowerCase());
  if (!isAdmin && existingProjects.length >= MAX_FREE_PROJECTS) {
    const hasActiveSubscription = existingProjects.some(
      (p) => p.subscription_status === "active"
    );
    if (!hasActiveSubscription) {
      return NextResponse.json(
        { error: `You can create up to ${MAX_FREE_PROJECTS} companies on the free plan. Subscribe to any company to unlock more.` },
        { status: 403 }
      );
    }
  }

  const runningJobId = await findRunningPipelineJobForUser(user.id);
  if (runningJobId) {
    return NextResponse.json(
      {
        error: "A company build is already running for your account. Reconnecting to it now.",
        jobId: runningJobId,
        status: "running",
      },
      { status: 409 }
    );
  }

  await cancelPendingPipelineJobsForUser(user.id, "Replaced by a newer company build request.");

  const payload = {
    prompt,
    userId: user.id,
    url,
    queuedBy: "user",
    isFirstCompany,
  };
  const jobId = await createRunningPipelineJob(payload);

  startPipelineJobInBackground(jobId, payload);

  return NextResponse.json({
    jobId,
    status: "running",
    message: "Build started immediately.",
  });
}
