import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb, getCompanyMemoryMap } from "@/lib/neon";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { getProjectCredits, decrementProjectCredits } from "@/lib/project-credits";
import { GENERATE_TASK_COST } from "@/config/credit-costs";
import { GenerateTaskSchema, parseBody } from "@/lib/validation";

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json();
  const parsed = parseBody(GenerateTaskSchema, raw);
  if (!parsed.success) return parsed.response;
  const { projectId } = parsed.data;

  const db = getDb();
  const projects = await db`
    SELECT id, name, task_credits, subscription_status
    FROM projects WHERE id = ${projectId} AND user_id = ${user.id}
  `;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const project = projects[0];

  // Credit check
  const creditsAvailable = getProjectCredits(project);
  if (creditsAvailable < GENERATE_TASK_COST) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://artha.run";
    return NextResponse.json(
      {
        error: "No credits remaining",
        action:
          project.subscription_status === "active"
            ? "wait_or_buy_pack"
            : "subscribe_or_buy_pack",
        purchaseUrl: `${appUrl}/dashboard?buy_credits=true`,
      },
      { status: 402 }
    );
  }

  const memoryMap = await getCompanyMemoryMap(
    projectId,
    ["companyName", "companyDescription", "tagline", "mission", "competitors", "keyInsights"]
  );

  const existingTasks = await db`
    SELECT title FROM tasks
    WHERE project_id = ${projectId} AND status IN ('queued', 'pending', 'running')
    LIMIT 20
  `;
  const existingTitles = existingTasks.map((t: Record<string, unknown>) => t.title).join(", ");

  const contextBlock = [
    `Company: ${memoryMap.companyName || project.name}`,
    memoryMap.companyDescription ? `Description: ${memoryMap.companyDescription}` : "",
    memoryMap.tagline ? `Tagline: ${memoryMap.tagline}` : "",
    memoryMap.mission ? `Mission: ${memoryMap.mission}` : "",
    memoryMap.competitors ? `Competitors: ${JSON.stringify(memoryMap.competitors)}` : "",
    memoryMap.keyInsights ? `Key Insights: ${JSON.stringify(memoryMap.keyInsights)}` : "",
    existingTitles ? `Already queued (avoid duplicating): ${existingTitles}` : "",
  ].filter(Boolean).join("\n");

  const result = await generateAgentJSON<{
    title: string;
    description: string;
    isRecurring: boolean;
  }>(
    "task_generator",
    `You are a startup growth strategist. Generate ONE high-impact task that will move this company forward.

Rules:
- Title should be action-oriented, starting with a verb (e.g., "Research 10 competitors' pricing strategies")
- Description should be 2-4 sentences: a specific execution brief explaining what to do and what good output looks like
- isRecurring should be true only if this task makes sense to repeat weekly (e.g., "Send weekly product update newsletter")
- Do NOT duplicate any task that is already queued

Return JSON with keys: title, description, isRecurring`,
    contextBlock,
    { maxTokens: 500, temperature: 0.8 }
  );

  // Deduct credits after successful generation
  await decrementProjectCredits(db, projectId, GENERATE_TASK_COST);

  return NextResponse.json({
    title: result.title || "",
    description: result.description || "",
    isRecurring: Boolean(result.isRecurring),
  });
}
