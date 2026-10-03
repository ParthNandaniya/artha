import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb, getCompanyMemoryMap } from "@/lib/neon";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { getProjectCredits, decrementProjectCredits } from "@/lib/project-credits";
import { projectIdSchema } from "@/lib/validation";

const SUGGESTION_COST = 0.05;

interface Suggestion {
  id: string;
  type: "empty_state" | "activity_nudge" | "performance" | "competitor";
  panel: string;
  title: string;
  description: string;
  actionLabel: string;
  chatMessage: string;
}

const SUGGESTIONS_PROMPT = `You are a startup growth advisor. Based on the company state, generate 2-3 contextual suggestions.

Rules:
- Each suggestion should be specific and actionable
- Types: "empty_state" (panel has no data), "activity_nudge" (user hasn't done something recently), "performance" (a metric changed), "competitor" (competitive opportunity)
- panel: which dashboard panel this relates to ("leads", "research", "email", "tasks", "landing-page", "twitter", "analytics")
- actionLabel: button text (under 20 chars)
- chatMessage: what to send to the AI chat to execute this suggestion
- Only suggest things that make sense given the actual data
- Skip suggestions for areas that already have good activity

Return JSON: { "suggestions": [{ "id": "<string>", "type": "<string>", "panel": "<string>", "title": "<string>", "description": "<string>", "actionLabel": "<string>", "chatMessage": "<string>" }] }`;

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await request.json();
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });

  const db = getDb();
  const projects = await db`
    SELECT id, name, task_credits, subscription_status
    FROM projects WHERE id = ${projectId} AND user_id = ${user.id}
  `;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const project = projects[0];
  const creditsAvailable = getProjectCredits(project);
  if (creditsAvailable < SUGGESTION_COST) {
    return NextResponse.json({ suggestions: [] });
  }

  // Gather state
  const [taskCounts, leadCount, docCount, emailCount] = await Promise.all([
    db`SELECT status, COUNT(*)::int as count FROM tasks WHERE project_id = ${projectId} GROUP BY status`,
    db`SELECT COUNT(*)::int as count FROM leads WHERE project_id = ${projectId}`,
    db`SELECT COUNT(*)::int as count FROM documents WHERE project_id = ${projectId}`,
    db`SELECT COUNT(*)::int as count FROM email_messages WHERE project_id = ${projectId} AND direction = 'outbound' AND created_at > NOW() - INTERVAL '7 days'`,
  ]);

  const memoryMap = await getCompanyMemoryMap(projectId, ["companyName", "tagline"]).catch(() => ({} as Record<string, unknown>));

  const contextParts = [
    `Company: ${memoryMap.companyName || project.name}`,
    `Tasks: ${JSON.stringify(taskCounts)}`,
    `Leads: ${leadCount[0]?.count ?? 0}`,
    `Documents: ${docCount[0]?.count ?? 0}`,
    `Outbound emails (7d): ${emailCount[0]?.count ?? 0}`,
  ].join("\n");

  const result = await generateAgentJSON<{ suggestions: Suggestion[] }>(
    "form_enhancement",
    SUGGESTIONS_PROMPT,
    contextParts,
    { maxTokens: 600, temperature: 0.7 },
  );

  await decrementProjectCredits(db, projectId, SUGGESTION_COST);

  return NextResponse.json(result);
}
