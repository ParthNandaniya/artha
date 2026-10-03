import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import { runCompetitiveMonitorAgent } from "@/lib/agents/competitive-monitor";
import { getCreditCost } from "@/config/credit-costs";
import { decrementProjectCredits, getProjectCredits } from "@/lib/project-credits";
import type { AgentName } from "@/lib/types";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  // Get competitors grouped by project
  const competitors = await db`
    SELECT c.*, p.user_id
    FROM competitors c
    JOIN projects p ON p.id = c.project_id
    WHERE p.status = 'active'
    ORDER BY c.project_id
  `;

  // Group by project
  const projectCompetitors = new Map<string, Array<Record<string, unknown>>>();
  for (const comp of competitors) {
    const pid = comp.project_id as string;
    if (!projectCompetitors.has(pid)) {
      projectCompetitors.set(pid, []);
    }
    projectCompetitors.get(pid)!.push(comp as Record<string, unknown>);
  }

  let checked = 0;
  let alertsCreated = 0;

  for (const [projectId, comps] of projectCompetitors) {
    // Check credits
    const projectRows = await db`SELECT * FROM projects WHERE id = ${projectId}`;
    if (projectRows.length === 0) continue;
    const credits = getProjectCredits(projectRows[0] as Record<string, unknown>);
    const cost = getCreditCost("competitive_monitor" as AgentName);
    if (credits < cost) continue;

    const userId = comps[0]?.user_id as string || "";
    const competitorList = comps.map((c) => `${c.name}: ${c.url}`).join("\n");

    try {
      const result = await runCompetitiveMonitorAgent({
        prompt: `Analyze these competitors and detect any significant changes:\n${competitorList}`,
        context: `Competitors to monitor:\n${competitorList}`,
        projectId,
        userId,
        metadata: { competitors: comps },
      });

      // Save any documents as alerts
      if (result.documents && result.documents.length > 0) {
        for (const doc of result.documents) {
          await db`
            INSERT INTO competitor_alerts (project_id, competitor_id, change_type, summary)
            VALUES (${projectId}, ${comps[0]?.id || null}, ${doc.type || "update"}, ${doc.content.slice(0, 1000)})
          `;
          alertsCreated++;
        }
      }

      // Update last_checked_at for all competitors in this project
      const compIds = comps.map((c) => c.id as string);
      await db`
        UPDATE competitors SET last_checked_at = NOW() WHERE id = ANY(${compIds})
      `;

      // Charge credits
      await decrementProjectCredits(db, projectId, cost);
      checked++;
    } catch (error) {
      console.error(`Competitive check failed for project ${projectId}:`, error);
    }
  }

  return NextResponse.json({ checked, alertsCreated });
}
