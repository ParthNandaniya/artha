import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import {
  takeSnapshot,
  compareSnapshots,
  getCompetitorSnapshots,
  storeSnapshot,
} from "@/lib/competitor-monitoring";

/**
 * Weekly cron — competitor website diffing.
 * For each project with competitors, take new snapshots, compare with previous,
 * and create a diff report document if changes are detected.
 */
export async function GET(_request: NextRequest) {
  const db = getDb();

  // Get all active projects that have competitors
  const competitors = await db`
    SELECT c.id AS competitor_id, c.project_id, c.url, c.name AS competitor_name
    FROM competitors c
    JOIN projects p ON p.id = c.project_id
    WHERE p.status = 'active' AND c.url IS NOT NULL AND c.url != ''
    ORDER BY c.project_id
  `;

  if (competitors.length === 0) {
    return NextResponse.json({ message: "No competitors to check", processed: 0 });
  }

  // Group by project
  const byProject = new Map<string, Array<Record<string, unknown>>>();
  for (const comp of competitors) {
    const pid = comp.project_id as string;
    if (!byProject.has(pid)) byProject.set(pid, []);
    byProject.get(pid)!.push(comp as Record<string, unknown>);
  }

  let snapshotsTaken = 0;
  let reportsCreated = 0;
  let errors = 0;

  for (const [projectId, comps] of byProject) {
    for (const comp of comps) {
      const url = comp.url as string;
      const competitorName = comp.competitor_name as string;

      try {
        // Take a new snapshot
        const newSnapshot = await takeSnapshot(url);
        await storeSnapshot(projectId, url, newSnapshot);
        snapshotsTaken++;

        // Get previous snapshot for comparison
        const previousSnapshots = await getCompetitorSnapshots(projectId, url);
        // previousSnapshots are ordered DESC, [0] is the one we just stored, [1] is the previous
        if (previousSnapshots.length < 2) continue;

        const oldSnapshot = previousSnapshots[1].snapshot;
        const diff = compareSnapshots(oldSnapshot, newSnapshot);

        if (diff.hasSignificantChanges) {
          // Create a diff report document
          const reportContent = buildDiffReport(competitorName, url, diff);
          await db`
            INSERT INTO documents (project_id, type, title, content, metadata)
            VALUES (
              ${projectId},
              'competitor_analysis',
              ${`Competitor Change: ${competitorName}`},
              ${reportContent},
              ${JSON.stringify({
                url,
                competitorName,
                changeCount: diff.changes.length,
                diffDate: new Date().toISOString(),
              })}
            )
          `;
          reportsCreated++;
        }
      } catch (error) {
        console.error(`Competitor diff failed for ${url} (project ${projectId}):`, error);
        errors++;
      }
    }
  }

  return NextResponse.json({ snapshotsTaken, reportsCreated, errors });
}

function buildDiffReport(
  competitorName: string,
  url: string,
  diff: { changes: Array<{ field: string; type: string; oldValue?: string; newValue?: string }>; summary: string }
): string {
  const lines: string[] = [
    `# Competitor Change Report: ${competitorName}`,
    `**URL:** ${url}`,
    `**Date:** ${new Date().toISOString().split("T")[0]}`,
    `**Summary:** ${diff.summary}`,
    "",
    "## Changes Detected",
    "",
  ];

  for (const change of diff.changes) {
    lines.push(`### ${change.field} (${change.type})`);
    if (change.oldValue) lines.push(`- **Before:** ${change.oldValue}`);
    if (change.newValue) lines.push(`- **After:** ${change.newValue}`);
    lines.push("");
  }

  return lines.join("\n");
}
