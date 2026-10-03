import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import { getCreditCost } from "@/config/credit-costs";
import { getProjectCredits } from "@/lib/project-credits";
import type { AgentName } from "@/lib/types";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getDb();

    const projects = await db`
      SELECT p.*, u.id AS user_id FROM projects p
      JOIN users u ON u.id = p.user_id
      WHERE p.status = 'active'
        AND p.landing_page_html IS NOT NULL
        AND (p.is_demo IS NULL OR p.is_demo = FALSE)
        AND COALESCE(p.hidden, false) = false
        AND COALESCE(u.hidden, false) = false
    `;

    let queued = 0;
    let skipped = 0;

    for (const project of projects) {
      const projectId = project.id as string;

      // Skip if reviewed within 7 days
      const lastReview = project.last_analytics_review_at as Date | null;
      if (lastReview && Date.now() - new Date(lastReview).getTime() < 7 * 24 * 60 * 60 * 1000) {
        skipped++;
        continue;
      }

      // Check credits
      const credits = getProjectCredits(project as Record<string, unknown>);
      const cost = getCreditCost("analytics_agent" as AgentName);
      if (credits < cost) {
        skipped++;
        continue;
      }

      // Queue as a task instead of running inline (avoids cron timeout)
      await db`
        INSERT INTO tasks (project_id, title, description, type, tag, agent, status, source)
        VALUES (
          ${projectId},
          ${"Analyze website analytics and identify improvements"},
          ${"Auto-queued by analytics cron — reviews site traffic patterns and creates actionable tasks."},
          ${"analytics"},
          ${"analytics"},
          ${"analytics_agent"},
          ${"queued"},
          ${"system"}
        )
      `;

      // Queue the task for the worker to pick up
      const newTask = await db`
        SELECT id FROM tasks
        WHERE project_id = ${projectId} AND agent = 'analytics_agent' AND status = 'queued'
        ORDER BY created_at DESC LIMIT 1
      `;

      if (newTask.length > 0) {
        await db`
          INSERT INTO job_queue (type, payload)
          VALUES ('run_task', ${JSON.stringify({
            projectId,
            taskId: newTask[0].id,
            queuedBy: "analytics-cron",
          })}::jsonb)
        `;
      }

      // Mark review timestamp so we don't re-queue next run
      await db`
        UPDATE projects SET last_analytics_review_at = NOW() WHERE id = ${projectId}
      `;

      queued++;
    }

    return NextResponse.json({ queued, skipped });
  } catch (error) {
    console.error("Analytics actions cron failed:", error);
    return NextResponse.json(
      { error: "Analytics actions failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
