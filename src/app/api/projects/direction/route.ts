import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb, getCompanyMemory, setCompanyMemory } from "@/lib/neon";
import { ingestMemory, companyTag } from "@/lib/supermemory";
import { buildCompanyProfileSummary } from "@/lib/personalization";
import { generateAgentCompletion } from "@/lib/ai/agent-model-router";

const MEMORY_KEY = "founderDirectives";
const MAX_LENGTH = 2000;

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id} LIMIT 1`;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const value = await getCompanyMemory(projectId, MEMORY_KEY);
  return NextResponse.json({ directives: value ?? "" });
}

export async function PATCH(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, directives } = body;
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  if (typeof directives !== "string") {
    return NextResponse.json({ error: "directives must be a string" }, { status: 400 });
  }
  const trimmed = directives.trim();
  if (trimmed.length > MAX_LENGTH) {
    return NextResponse.json({ error: `Directives too long (max ${MAX_LENGTH} chars)` }, { status: 400 });
  }

  const db = getDb();
  const projects = await db`SELECT id, name FROM projects WHERE id = ${projectId} AND user_id = ${user.id} LIMIT 1`;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await setCompanyMemory(projectId, MEMORY_KEY, trimmed || null);

  if (trimmed) {
    ingestMemory({
      content: `Founder directives for ${projects[0].name}:\n${trimmed}`,
      containerTag: companyTag(projectId),
      dedupeKey: `founder_directives_${projectId}`,
      projectId,
      customId: `founder_directives_${projectId}`,
      metadata: { type: "founder_directives" },
    }).catch((err) => console.error("[direction] supermemory ingest failed:", err));
  }

  return NextResponse.json({ directives: trimmed });
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId } = body;
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id} LIMIT 1`;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const companyContext = await buildCompanyProfileSummary(projectId);
  if (!companyContext) return NextResponse.json({ error: "Not enough company data yet" }, { status: 422 });

  const existing = await getCompanyMemory(projectId, MEMORY_KEY);

  const generated = await generateAgentCompletion(
    "direct_answer",
    `You are a startup strategy advisor. Based on the company context below, generate a concise set of founder directives — strategic priorities and focus areas for the AI agents running this company.

Rules:
- Write 3-5 short, actionable directives (1-2 sentences each)
- Be specific to this company, not generic advice
- Focus on what to prioritize in the next 30-90 days
- Consider the current mission, target audience, competitors, and active tasks
- Write in first person as if the founder is speaking ("Focus on...", "Prioritize...", "Our target is...")
- Keep total output under 600 characters
${existing ? `\nThe founder previously set these directives (incorporate or build on them if still relevant):\n${existing}` : ""}

Company context:
${companyContext}`,
    "Generate strategic directives for this company.",
    { maxTokens: 400 },
  );

  return NextResponse.json({ directives: generated.trim() });
}
