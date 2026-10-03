import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import { runSeoAgent } from "@/lib/agents/seo-agent";
import { getCreditCost } from "@/config/credit-costs";
import { decrementProjectCredits, getProjectCredits } from "@/lib/project-credits";
import type { AgentName } from "@/lib/types";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  let reviewed = 0;
  let reportsCreated = 0;

  for (const project of projects) {
    const projectId = project.id as string;

    // Check credits
    const credits = getProjectCredits(project as Record<string, unknown>);
    const cost = getCreditCost("seo_agent" as AgentName);
    if (credits < cost) continue;

    try {
      const result = await runSeoAgent({
        prompt: `Perform an SEO audit for ${project.name}. Analyze keyword opportunities, meta tag improvements, and content gaps.`,
        context: `Company: ${project.name}\nSlug: ${project.slug}\nSite URL: https://${project.slug}.tryartha.com`,
        projectId,
        userId: project.user_id as string,
      });

      // Save SEO report from documents
      if (result.documents && result.documents.length > 0) {
        const reportDoc = result.documents[0];
        await db`
          INSERT INTO seo_reports (project_id, keywords, meta_suggestions, content_gaps)
          VALUES (
            ${projectId},
            ${JSON.stringify(reportDoc.metadata?.keywords || [])}::jsonb,
            ${JSON.stringify(reportDoc.metadata?.meta_suggestions || {})}::jsonb,
            ${JSON.stringify(reportDoc.metadata?.content_gaps || [])}::jsonb
          )
        `;
        reportsCreated++;
      }

      // Insert any tasks created by the agent
      if (result.tasksCreated && result.tasksCreated.length > 0) {
        for (const task of result.tasksCreated) {
          await db`
            INSERT INTO tasks (project_id, title, description, type, tag, agent, status, source)
            VALUES (${projectId}, ${task.title}, ${task.description || ""}, ${task.type || "custom"}, ${"seo"}, ${task.agent || null}, 'pending', 'system')
          `;
        }
      }

      // Charge credits
      await decrementProjectCredits(db, projectId, cost);
      reviewed++;
    } catch (error) {
      console.error(`SEO review failed for project ${projectId}:`, error);
    }
  }

  return NextResponse.json({ reviewed, reportsCreated });
}
