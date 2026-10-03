import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb, getCompanyMemoryMap } from "@/lib/neon";
import { generateMission } from "@/lib/ai/research/mission-generator";
import { generateMarketResearch } from "@/lib/ai/research/market-researcher";
import { generateLandingPage } from "@/lib/ai/website-builder/landing-page-builder";
import { executeTask } from "@/lib/ai/tasks/task-runner";
import type { ProjectMemory } from "@/lib/memory";
import { buildTaskContext, ingestTaskResult, ingestMemory, companyTag } from "@/lib/supermemory";
import { summarizeContentForMemory } from "@/lib/personalization";
import { decrementProjectCredits, getProjectCredits } from "@/lib/project-credits";
import { getCreditCost } from "@/config/credit-costs";
import type { AgentName } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { taskId, projectId } = await request.json();
    if (!taskId || !projectId) {
      return NextResponse.json({ error: "Missing taskId or projectId" }, { status: 400 });
    }

    const db = getDb();
    const projects = await db`SELECT * FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
    if (projects.length === 0) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const project = projects[0];

    const tasks = await db`SELECT * FROM tasks WHERE project_id = ${projectId} AND id = ${taskId}`;
    if (tasks.length === 0) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    const task = tasks[0];

    // Onboarding tasks are free; active projects are charged credits
    const isOnboarding = project.status === "onboarding";
    if (!isOnboarding) {
      const creditsAvailable = getProjectCredits(project as Record<string, unknown>);
      const cost = getCreditCost(task.agent as AgentName | null);
      if (creditsAvailable < cost) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://artha.run";
        return NextResponse.json({
          error: "No task credits remaining",
          message: "You're out of task credits. Buy a credit pack or subscribe to keep running tasks.",
          purchaseUrl: `${appUrl}/dashboard?buy_credits=true`,
        }, { status: 402 });
      }
      await decrementProjectCredits(db, projectId, cost);
    }

    await db`UPDATE tasks SET status = 'running', started_at = NOW() WHERE project_id = ${projectId} AND id = ${taskId}`;

    const memoryRaw = await getCompanyMemoryMap(projectId, [
      "companyName",
      "companyDescription",
      "tagline",
      "mission",
      "competitors",
      "keyInsights",
      "landingPageUrl",
      "emailConfigured",
    ]);
    const memory: ProjectMemory = {
      companyName: (memoryRaw.companyName as string) || (project.name as string),
      companyDescription: (memoryRaw.companyDescription as string) || "",
      tagline: memoryRaw.tagline as string,
      mission: memoryRaw.mission as string,
      competitors: memoryRaw.competitors as string[],
      keyInsights: memoryRaw.keyInsights as string[],
      landingPageUrl: memoryRaw.landingPageUrl as string,
      emailConfigured: memoryRaw.emailConfigured as boolean,
    };

    const smContext = await buildTaskContext({
      projectId,
      userId: project.user_id as string,
      taskDescription: (task.prompt as string) || (task.description as string) || (task.title as string),
    });

    let result: Record<string, unknown> = {};
    let summary = "";

    switch (task.type) {
      case "mission_gen": {
        const users = await db`SELECT google_data, name FROM users WHERE id = ${project.user_id}`;
        const userBackground = (users[0]?.google_data as Record<string, unknown>)?.research
          ? JSON.stringify((users[0]?.google_data as Record<string, unknown>).research)
          : (users[0]?.name as string) || "";
        const mission = await generateMission(memory.companyDescription || (task.prompt as string) || "", memory, userBackground);
        await db`INSERT INTO documents (project_id, type, title, content, metadata) VALUES (${projectId}, 'mission', ${mission.title}, ${mission.content}, ${JSON.stringify(mission.metadata)}::jsonb)`;
        result = { title: mission.title };
        summary = `Generated mission document: "${mission.title}"`;
        await ingestMemory({
          content: [
            `Mission document for ${project.name as string}`,
            `Summary: ${summarizeContentForMemory(mission.content, 900)}`,
          ].join("\n"),
          containerTag: companyTag(projectId),
          dedupeKey: `mission_${projectId}`,
          projectId,
          userId: project.user_id as string,
          customId: `mission_${projectId}`,
          metadata: { type: "mission_document" },
        });
        break;
      }
      case "market_research": {
        const research = await generateMarketResearch(memory.companyDescription || (task.prompt as string) || "", memory);
        await db`INSERT INTO documents (project_id, type, title, content, metadata) VALUES (${projectId}, 'market_research', ${research.title}, ${research.content}, ${JSON.stringify(research.metadata)}::jsonb)`;
        result = { metadata: research.metadata };
        summary = `Found ${research.metadata.competitors?.length || 0} competitors`;
        await ingestMemory({
          content: [
            `Market research for ${project.name as string}`,
            research.metadata.targetMarketSize ? `Market Size: ${research.metadata.targetMarketSize}` : "",
            research.metadata.competitors?.length ? `Competitors: ${research.metadata.competitors.map((item) => item.name).slice(0, 5).join(", ")}` : "",
            research.metadata.gaps?.length ? `Key Gaps: ${research.metadata.gaps.slice(0, 4).join(" | ")}` : "",
            research.metadata.keyTrends?.length ? `Key Trends: ${research.metadata.keyTrends.slice(0, 4).join(" | ")}` : "",
            `Summary: ${summarizeContentForMemory(research.content, 900)}`,
          ].filter(Boolean).join("\n"),
          containerTag: companyTag(projectId),
          dedupeKey: `market_research_${projectId}`,
          projectId,
          userId: project.user_id as string,
          customId: `market_research_${projectId}`,
          metadata: { type: "market_research" },
        });
        break;
      }
      case "landing_page": {
        const html = await generateLandingPage(
          memory.companyDescription || (task.prompt as string) || "",
          memory,
          project.slug as string,
          project.name as string,
          undefined,
          {
            marketplace: {
              projectId,
              userId: project.user_id as string,
              prompt: (task.prompt as string) || memory.companyDescription || "",
            },
          }
        );
        await db`UPDATE projects SET landing_page_html = ${html}, landing_page_published = TRUE WHERE id = ${projectId}`;
        const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
        const pageUrl = `https://${project.slug}.${companyDomain}`;
        result = { url: pageUrl };
        summary = `Built landing page at ${pageUrl}`;
        break;
      }
      default: {
        const taskResult = await executeTask(task as never, smContext);
        result = taskResult.result;
        summary = taskResult.summary;
        break;
      }
    }

    await db`
      UPDATE tasks SET status = 'completed', result = ${JSON.stringify(result)}, summary = ${summary}, completed_at = NOW()
      WHERE project_id = ${projectId} AND id = ${taskId}
    `;

    ingestTaskResult({
      projectId,
      userId: project.user_id as string,
      taskId: taskId as string,
      taskTitle: task.title as string,
      taskType: (task.type as string) || "custom",
      summary,
    }).catch(() => {});

    return NextResponse.json({ status: "completed", result, summary });
  } catch (error) {
    console.error("Task execution error:", error);
    return NextResponse.json({ error: "Task execution failed" }, { status: 500 });
  }
}
