import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb, getCompanyMemoryMap } from "@/lib/neon";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { getProjectCredits, decrementProjectCredits } from "@/lib/project-credits";
import { projectIdSchema } from "@/lib/validation";

const BRIEFING_COST = 0.3;

interface BriefingOpportunity {
  type: "lead" | "competitor" | "analytics" | "content";
  title: string;
  description: string;
  panel: string;
}

interface BriefingAction {
  label: string;
  chatMessage: string;
}

interface BriefingResult {
  headline: string;
  opportunities: BriefingOpportunity[];
  suggestedActions: BriefingAction[];
}

const BRIEFING_PROMPT = `You are a startup growth advisor. Generate a concise morning briefing for this company based on their current state.

Rules:
- headline: 1 sentence summary of the most important thing happening (under 80 chars)
- opportunities: up to 3 actionable opportunities. Each has:
  - type: one of "lead", "competitor", "analytics", "content"
  - title: short label (under 40 chars)
  - description: 1 sentence explaining the opportunity
  - panel: which dashboard panel to navigate to ("leads", "research", "analytics", "email", "tasks", "landing-page")
- suggestedActions: up to 3 quick actions the user could take. Each has:
  - label: button text (under 30 chars)
  - chatMessage: the message to send to the AI chat assistant to execute this action
- Base everything on the actual data provided — don't make up numbers
- Be specific and actionable, not generic

Return JSON: { "headline": "<string>", "opportunities": [...], "suggestedActions": [...] }`;

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await request.json();
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });

  const db = getDb();
  const projects = await db`
    SELECT id, name, task_credits, subscription_status, last_briefing, last_briefing_at
    FROM projects WHERE id = ${projectId} AND user_id = ${user.id}
  `;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const project = projects[0];

  // Return cached briefing if generated today
  if (project.last_briefing && project.last_briefing_at) {
    const lastAt = new Date(project.last_briefing_at as string);
    const now = new Date();
    if (lastAt.toDateString() === now.toDateString()) {
      return NextResponse.json(project.last_briefing);
    }
  }

  // Credit check
  const creditsAvailable = getProjectCredits(project);
  if (creditsAvailable < BRIEFING_COST) {
    return NextResponse.json({ error: "No credits remaining" }, { status: 402 });
  }

  // Build context
  const memoryMap = await getCompanyMemoryMap(projectId, [
    "companyName", "companyDescription", "tagline", "mission", "competitors",
  ]).catch(() => ({} as Record<string, unknown>));

  // Gather stats
  const [taskStats, leadStats, analyticsStats] = await Promise.all([
    db`SELECT status, COUNT(*)::int as count FROM tasks WHERE project_id = ${projectId} GROUP BY status`,
    db`SELECT status, COUNT(*)::int as count FROM leads WHERE project_id = ${projectId} GROUP BY status`,
    db`SELECT COUNT(DISTINCT visitor_id)::int as visitors FROM site_analytics WHERE project_id = ${projectId} AND created_at > NOW() - INTERVAL '7 days'`.catch(() => [{ visitors: 0 }]),
  ]);

  const contextParts = [
    `Company: ${memoryMap.companyName || project.name}`,
    memoryMap.tagline ? `Tagline: ${memoryMap.tagline}` : "",
    `Tasks: ${JSON.stringify(taskStats)}`,
    `Leads: ${JSON.stringify(leadStats)}`,
    `Site visitors (7d): ${analyticsStats[0]?.visitors ?? 0}`,
    memoryMap.competitors ? `Competitors: ${JSON.stringify(memoryMap.competitors)}` : "",
  ].filter(Boolean).join("\n");

  const result = await generateAgentJSON<BriefingResult>(
    "content_planner",
    BRIEFING_PROMPT,
    contextParts,
    { maxTokens: 800, temperature: 0.7 },
  );

  // Cache the briefing
  await db`
    UPDATE projects
    SET last_briefing = ${JSON.stringify(result)}, last_briefing_at = NOW()
    WHERE id = ${projectId}
  `;

  await decrementProjectCredits(db, projectId, BRIEFING_COST);

  return NextResponse.json(result);
}
