import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getDb, getCompanyMemoryMap } from "@/lib/neon";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { getProjectCredits, decrementProjectCredits } from "@/lib/project-credits";
import { projectIdSchema, parseBody } from "@/lib/validation";
import type { AgentName } from "@/lib/types";

// ── Action definitions ──────────────────────────────────────────────────────

type InlineAction =
  | "suggest_next_steps"
  | "enrich_lead"
  | "draft_reply"
  | "deep_dive_research"
  | "rewrite_website_section";

const ACTION_CONFIG: Record<
  InlineAction,
  { agent: AgentName | "form_enhancement"; credit: number; systemPrompt: string }
> = {
  suggest_next_steps: {
    agent: "form_enhancement",
    credit: 0.2,
    systemPrompt: `You are a startup growth strategist. Based on the company's current state and existing tasks, suggest 3 high-impact next steps.

Rules:
- Each task: action-oriented title (starts with verb, under 80 chars) + 1-2 sentence description
- Focus on what will move the needle RIGHT NOW
- Avoid duplicating existing tasks
- Order by impact (highest first)

Return JSON: { "suggestions": [{ "title": "<string>", "description": "<string>" }] }`,
  },

  enrich_lead: {
    agent: "form_enhancement",
    credit: 0.3,
    systemPrompt: `You are a startup sales researcher. Given a lead's name and company, generate enrichment data.

Rules:
- role: best guess at their job title/role based on context
- linkedin_url: construct likely LinkedIn URL if name is clear (https://linkedin.com/in/firstname-lastname), or leave empty
- notes: 2-3 bullet points (use "- " prefix) about why this person is relevant, potential talking points, or pain points
- Be specific and actionable, not generic

Return JSON: { "role": "<string>", "linkedin_url": "<string>", "notes": "<string>" }`,
  },

  draft_reply: {
    agent: "form_enhancement",
    credit: 0.3,
    systemPrompt: `You are a startup email strategist. Draft a professional reply to the email thread provided.

Rules:
- subject: keep "Re: <original subject>" unless the topic has clearly changed
- body: professional but warm, concise (2-4 short paragraphs), addresses the key points in the thread, ends with a clear next step or CTA, plain text (no HTML)
- Match the tone of the company brand
- SIGN-OFF: use the sender's real first name from the "Sender:" field. NEVER use "[Your Name]" or placeholders.

Return JSON: { "subject": "<string>", "body": "<string>" }`,
  },

  deep_dive_research: {
    agent: "form_enhancement",
    credit: 0.3,
    systemPrompt: `You are a startup research strategist. Given a research topic/tag, generate a detailed research prompt that an AI research agent can execute.

Rules:
- prompt: 3-5 sentences describing exactly what data to find, what format to use, what metrics or sources to focus on
- title: short, descriptive title for the research document (under 60 chars)
- Be specific about the industry/market context provided

Return JSON: { "title": "<string>", "prompt": "<string>" }`,
  },

  rewrite_website_section: {
    agent: "form_enhancement",
    credit: 0.3,
    systemPrompt: `You are a startup landing page copywriter. Given a description of what the user wants changed on their website, generate the updated content.

Rules:
- suggestion: 2-4 sentences describing the specific copy/content changes to make
- headline: if relevant, a new headline suggestion (under 80 chars)
- Keep it aligned with the company brand and mission
- Focus on conversion and clarity

Return JSON: { "suggestion": "<string>", "headline": "<string>" }`,
  },
};

// ── Validation ──────────────────────────────────────────────────────────────

const InlineActionSchema = z.object({
  projectId: projectIdSchema,
  action: z.enum([
    "suggest_next_steps",
    "enrich_lead",
    "draft_reply",
    "deep_dive_research",
    "rewrite_website_section",
  ]),
  context: z.record(z.string(), z.unknown()).optional().default({}),
});

// ── Build company context (same pattern as /api/ai/enhance) ─────────────────

async function buildCompanyContext(projectId: string, project: Record<string, unknown>) {
  let companyContext = `Company: ${project.name}`;
  try {
    const memoryMap = await getCompanyMemoryMap(projectId, [
      "companyName",
      "companyDescription",
      "tagline",
      "mission",
      "competitors",
      "keyInsights",
    ]);
    companyContext = [
      `Company: ${memoryMap.companyName || project.name}`,
      memoryMap.companyDescription ? `Description: ${memoryMap.companyDescription}` : "",
      memoryMap.tagline ? `Tagline: ${memoryMap.tagline}` : "",
      memoryMap.mission ? `Mission: ${memoryMap.mission}` : "",
      memoryMap.competitors ? `Competitors: ${JSON.stringify(memoryMap.competitors)}` : "",
      memoryMap.keyInsights ? `Key Insights: ${JSON.stringify(memoryMap.keyInsights)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  } catch {
    // Fall back to basic context
  }
  return companyContext;
}

// ── Route handler ───────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json();
  const parsed = parseBody(InlineActionSchema, raw);
  if (!parsed.success) return parsed.response;
  const { projectId, action, context } = parsed.data;

  const db = getDb();
  const projects = await db`
    SELECT id, name, task_credits, subscription_status
    FROM projects WHERE id = ${projectId} AND user_id = ${user.id}
  `;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const project = projects[0];
  const config = ACTION_CONFIG[action];

  // Credit check
  const creditsAvailable = getProjectCredits(project);
  if (creditsAvailable < config.credit) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://artha.run";
    return NextResponse.json(
      {
        error: "No credits remaining",
        action: project.subscription_status === "active" ? "wait_or_buy_pack" : "subscribe_or_buy_pack",
        purchaseUrl: `${appUrl}/dashboard?buy_credits=true`,
      },
      { status: 402 },
    );
  }

  // Build context
  const companyContext = await buildCompanyContext(projectId, project);
  const userParts = [companyContext];

  if (user.name) userParts.push(`Sender: ${user.name}`);

  // Action-specific context enrichment
  if (action === "suggest_next_steps") {
    try {
      const existingTasks = await db`
        SELECT title FROM tasks
        WHERE project_id = ${projectId} AND status IN ('queued', 'pending', 'running')
        LIMIT 20
      `;
      const titles = existingTasks.map((t: Record<string, unknown>) => t.title).join(", ");
      if (titles) userParts.push(`Existing tasks (avoid duplicating): ${titles}`);
    } catch {
      // ignore
    }
  }

  // Append caller-provided context
  if (context && typeof context === "object") {
    for (const [key, value] of Object.entries(context)) {
      if (value) userParts.push(`${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
    }
  }

  // Call the AI
  const result = await generateAgentJSON<Record<string, unknown>>(
    config.agent,
    config.systemPrompt,
    userParts.join("\n\n"),
    { maxTokens: 1200, temperature: 0.7 },
  );

  // Deduct credits
  await decrementProjectCredits(db, projectId, config.credit);

  return NextResponse.json(result);
}
