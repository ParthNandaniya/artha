import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { runLeadFinderAgent } from "@/lib/agents/lead-finder";
import { persistAgentOutput } from "@/lib/agents/orchestrator";
import { buildChatContext } from "@/lib/supermemory";
import { decrementProjectCredits, getProjectCredits } from "@/lib/project-credits";
import { getCreditCost } from "@/config/credit-costs";

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, instructions } = await request.json();
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();
  const projects = await db`
    SELECT * FROM projects WHERE id = ${projectId} AND user_id = ${user.id} LIMIT 1
  `;
  if (projects.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const project = projects[0] as Record<string, unknown>;
  const creditsAvailable = getProjectCredits(project);
  if (creditsAvailable < getCreditCost("lead_finder")) {
    return NextResponse.json({ error: "No credits remaining" }, { status: 402 });
  }

  const companyName = (project.name as string) || "the company";
  const basePrompt = `Find high-quality business leads for ${companyName}. Identify real companies and decision-makers who would be ideal customers or partners.`;
  const prompt = instructions
    ? `${basePrompt}\n\nAdditional instructions from the founder: ${instructions}`
    : basePrompt;

  const context = await buildChatContext({
    projectId,
    userId: user.id,
    userMessage: prompt,
  });

  const output = await runLeadFinderAgent({
    prompt,
    context,
    projectId,
    userId: user.id,
  });

  if (output.success) {
    await persistAgentOutput(projectId, user.id, output);
    await decrementProjectCredits(db, projectId, getCreditCost("lead_finder"));
  }

  return NextResponse.json({
    success: output.success,
    leadsCount: output.leads?.length || 0,
    summary: output.summary,
    error: output.error,
  });
}
