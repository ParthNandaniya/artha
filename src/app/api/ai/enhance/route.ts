import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb, getCompanyMemoryMap } from "@/lib/neon";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { getProjectCredits, decrementProjectCredits } from "@/lib/project-credits";
import { ENHANCE_COST } from "@/config/credit-costs";
import { EnhanceFormSchema, parseBody } from "@/lib/validation";

type FormType = "task" | "email" | "research" | "tweet" | "outreach" | "lead_note" | "research_tag";

const FORM_PROMPTS: Record<FormType, string> = {
  task: `You are a startup growth strategist. Generate ONE high-impact task for this company.

Rules:
- title: action-oriented, starts with a verb, under 80 chars
- description: 2-4 sentences — specific execution brief explaining what to do and what good output looks like
- isRecurring: true only if this task makes sense to repeat weekly
- Do NOT duplicate any existing queued task

Return JSON: { "title": "<string>", "description": "<string>", "isRecurring": <boolean> }`,

  email: `You are a startup email strategist. Generate a professional email for this company.

Rules:
- subject: compelling but professional, under 60 chars
- body: professional tone matching the company brand, clear and concise, include a call to action, plain text (no HTML)
- If a recipient (to) is provided, tailor the email to them
- SIGN-OFF: use the sender's real first name from the "Sender:" field in context for the closing. NEVER use placeholders like "[Your Name]" or "[Name]" or "[Your Contact Information]"

Return JSON: { "subject": "<string>", "body": "<string>" }`,

  research: `You are a startup research strategist. Generate a detailed research prompt for this company.

Rules:
- prompt: specific about what data to find, what format the output should be in, mention specific metrics or sources if relevant
- 2-4 sentences that give clear direction to an AI research agent
- If a tag is provided, align the research to that category

Return JSON: { "prompt": "<string>" }`,

  tweet: `You are a startup social media strategist. Generate a tweet for this company.

Rules:
- content: must be under 280 characters
- Engaging, authentic voice — not corporate
- Can include relevant hashtags (1-2 max)
- Should promote the company, share an insight, or engage the audience

Return JSON: { "content": "<string>" }`,

  outreach: `You are a startup outreach specialist. Improve this cold outreach email to a specific lead.

Rules:
- subject: personalized, compelling, under 60 chars — reference the recipient's company or role if known
- body: professional but warm tone, concise (3-5 short paragraphs), personalized to the recipient, clear value proposition, ends with a low-friction CTA, plain text (no HTML)
- If the recipient's name, company, or role is provided, weave them naturally into the email
- If current values exist, enhance them — keep the core intent but make them sharper and more personalized
- SIGN-OFF: use the sender's real first name from the "Sender:" field in context for the closing. NEVER use placeholders like "[Your Name]" or "[Name]" or "[Your Contact Information]"

Return JSON: { "subject": "<string>", "body": "<string>" }`,

  lead_note: `You are a startup sales strategist. Generate useful talking points / notes about a lead for a sales conversation.

Rules:
- notes: 3-5 bullet points (use "- " prefix), each a concise talking point or observation
- Reference the lead's company, role, and any available context to make points specific
- Include: potential pain points, conversation starters, value alignment, qualification signals
- If current notes exist, enhance and expand them rather than replacing

Return JSON: { "notes": "<string>" }`,

  research_tag: `You are a startup research strategist. Suggest a custom research tag for this company.

Rules:
- label: short human-readable name (2-4 words), e.g. "Investor Research", "SEO Audit"
- description: 1-2 sentences describing what research this tag covers, what data to gather
- Make it relevant and useful for the company's stage and industry
- If current values exist, enhance them

Return JSON: { "label": "<string>", "description": "<string>" }`,
};

async function buildCompanyContext(projectId: string, project: Record<string, unknown>) {
  let companyContext = `Company: ${project.name}`;
  try {
    const memoryMap = await getCompanyMemoryMap(
      projectId,
      [
        "companyName",
        "companyDescription",
        "tagline",
        "mission",
        "competitors",
        "keyInsights",
      ]
    );
    companyContext = [
      `Company: ${memoryMap.companyName || project.name}`,
      memoryMap.companyDescription
        ? `Description: ${memoryMap.companyDescription}`
        : "",
      memoryMap.tagline ? `Tagline: ${memoryMap.tagline}` : "",
      memoryMap.mission ? `Mission: ${memoryMap.mission}` : "",
      memoryMap.competitors
        ? `Competitors: ${JSON.stringify(memoryMap.competitors)}`
        : "",
      memoryMap.keyInsights
        ? `Key Insights: ${JSON.stringify(memoryMap.keyInsights)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  } catch {
    // Fall back to basic context
  }
  return companyContext;
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json();
  const parsed = parseBody(EnhanceFormSchema, raw);
  if (!parsed.success) return parsed.response;
  const { projectId, formType, currentValues, context } = parsed.data;

  const db = getDb();
  const projects = await db`
    SELECT id, name, task_credits, subscription_status
    FROM projects WHERE id = ${projectId} AND user_id = ${user.id}
  `;
  if (projects.length === 0)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const project = projects[0];

  // Credit check
  const creditsAvailable = getProjectCredits(project);
  if (creditsAvailable < ENHANCE_COST) {
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

  const companyContext = await buildCompanyContext(projectId, project);
  const userParts = [companyContext];

  // Include sender name so AI can personalize sign-offs instead of "[Your Name]"
  if (user.name) {
    userParts.push(`Sender: ${user.name}`);
  }

  // For tasks, fetch existing queued tasks to avoid duplicates
  if (formType === "task") {
    try {
      const existingTasks = await db`
        SELECT title FROM tasks
        WHERE project_id = ${projectId} AND status IN ('queued', 'pending', 'running')
        LIMIT 20
      `;
      const titles = existingTasks
        .map((t: Record<string, unknown>) => t.title)
        .join(", ");
      if (titles) {
        userParts.push(`Already queued (avoid duplicating): ${titles}`);
      }
    } catch {
      // ignore — generate without dedup context
    }
  }

  // Add current values as context if user already filled some fields
  if (currentValues && typeof currentValues === "object") {
    const filled = Object.entries(currentValues)
      .filter(([, v]) => typeof v === "string" && (v as string).trim())
      .map(([k, v]) => `Current ${k}: ${v}`);
    if (filled.length > 0) {
      userParts.push(filled.join("\n"));
      userParts.push(
        "Use the current values as a starting point — enhance and improve them."
      );
    } else {
      userParts.push("Generate fresh content from scratch.");
    }
  } else {
    userParts.push("Generate fresh content from scratch.");
  }

  // Extra context (e.g. tag for research, recipient for email)
  if (context && typeof context === "object") {
    for (const [key, value] of Object.entries(context)) {
      if (value) userParts.push(`${key}: ${value}`);
    }
  }

  const systemPrompt = FORM_PROMPTS[formType as FormType];
  const result = await generateAgentJSON<Record<string, unknown>>(
    "form_enhancement",
    systemPrompt,
    userParts.join("\n\n"),
    { maxTokens: 800, temperature: 0.8 }
  );

  // Deduct credits after successful generation
  await decrementProjectCredits(db, projectId, ENHANCE_COST);

  return NextResponse.json(result);
}
