import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { getDeliverabilityMetrics, getDomainHealth } from "@/lib/email-deliverability";
import { getWarmupStatus, startWarmup, pauseWarmup, resumeWarmup } from "@/lib/email-warmup";
import { listAbTests } from "@/lib/email-ab-testing";

export async function GET(request: Request) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId)
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();

  // Verify project ownership
  const projectRows = await db`
    SELECT id FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
    LIMIT 1
  `;
  if (projectRows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const daysParam = searchParams.get("days");
  const days = Math.min(Math.max(parseInt(daysParam || "30", 10), 1), 90);

  const [metrics, warmup, domainHealth, abTests] = await Promise.all([
    getDeliverabilityMetrics(projectId, days),
    getWarmupStatus(projectId),
    getDomainHealth(projectId),
    listAbTests(projectId),
  ]);

  return NextResponse.json({ metrics, warmup, domainHealth, abTests });
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, action } = body as { projectId?: string; action?: string };

  if (!projectId || !action)
    return NextResponse.json(
      { error: "Missing projectId or action" },
      { status: 400 }
    );

  const db = getDb();

  // Verify project ownership
  const projectRows = await db`
    SELECT id FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
    LIMIT 1
  `;
  if (projectRows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  switch (action) {
    case "start-warmup": {
      const warmup = await startWarmup(projectId);
      return NextResponse.json({ warmup });
    }
    case "pause-warmup": {
      const warmup = await pauseWarmup(projectId);
      if (!warmup)
        return NextResponse.json(
          { error: "Warmup is not active" },
          { status: 400 }
        );
      return NextResponse.json({ warmup });
    }
    case "resume-warmup": {
      const warmup = await resumeWarmup(projectId);
      if (!warmup)
        return NextResponse.json(
          { error: "Warmup is not paused" },
          { status: 400 }
        );
      return NextResponse.json({ warmup });
    }
    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 400 }
      );
  }
}
