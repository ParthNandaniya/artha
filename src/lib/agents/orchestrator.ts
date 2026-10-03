import { generateAgentJSON, generateAgentCompletion, generateAgentCompletionStreaming } from "@/lib/ai/agent-model-router";
import { buildChatContext, ingestMemory, companyTag } from "@/lib/supermemory";
import { getDb, setCompanyMemory } from "@/lib/neon";
import { decrementProjectCredits } from "@/lib/project-credits";
import { getCreditCost } from "@/config/credit-costs";
import { runResearchAgent } from "./research";
import { runWebsiteBuilderAgent } from "./website-builder";
import { runEmailWriterAgent } from "./email-writer";
import { runTaskGeneratorAgent } from "./task-generator";
import { runTwitterAgent } from "./twitter";
import { runLeadFinderAgent } from "./lead-finder";
import { runDatabaseManagerAgent } from "./database-manager";
import { runStripeAgent } from "./stripe-agent";
import { runEmailReplierAgent } from "./email-replier";
import { runContentPlannerAgent } from "./content-planner";
import { runAnalyticsAgent } from "./analytics-agent";
import { runCompetitiveMonitorAgent } from "./competitive-monitor";
import { runSeoAgent } from "./seo-agent";
import { runVideoGeneratorAgent } from "./video-generator";
import { runSocialMediaManagerAgent } from "./social-media-manager";
import { runSalesSequencerAgent } from "./sales-sequencer";
import { saveWebsiteDraft, getProjectWebsite, getAllProjectPages } from "@/lib/website";
import { validateLandingPage } from "@/lib/ai/website-builder/validation";
import { syncProjectPricingPlans } from "@/lib/marketplace";
import { ExecutionScratchpad } from "./framework/scratchpad";
import type {
  AgentInput,
  AgentOutput,
  AgentName,
  IntentType,
  AgentSubtask,
  DecomposedIntent,
  MultiAgentPlan,
  AgentDoneResult,
  ExecutionSummary,
  SSEEvent,
  SubtaskBreakdownItem,
} from "./types";

type SSEWriter = (event: SSEEvent) => void;

// Artha ops agents are not user-facing — they run via their own cron/worker path.
// Stub them here to satisfy the Record<AgentName, ...> type.
const opsAgentStub = async (input: AgentInput): Promise<AgentOutput> => ({
  success: false,
  agent: input.metadata?.agent as AgentName || "research",
  summary: "Artha ops agents are not invocable through the orchestrator",
  error: "Use the /api/cron/artha-* endpoints instead",
});

const AGENT_RUNNERS: Record<AgentName, (input: AgentInput) => Promise<AgentOutput>> = {
  research: runResearchAgent,
  website_builder: runWebsiteBuilderAgent,
  email_writer: runEmailWriterAgent,
  task_generator: runTaskGeneratorAgent,
  twitter: runTwitterAgent,
  lead_finder: runLeadFinderAgent,
  database_manager: runDatabaseManagerAgent,
  stripe_agent: runStripeAgent,
  email_replier: runEmailReplierAgent,
  content_planner: runContentPlannerAgent,
  analytics_agent: runAnalyticsAgent,
  competitive_monitor: runCompetitiveMonitorAgent,
  seo_agent: runSeoAgent,
  video_generator: runVideoGeneratorAgent,
  social_media_manager: runSocialMediaManagerAgent,
  sales_sequencer: runSalesSequencerAgent,
  blog_writer: opsAgentStub,
  artha_growth: opsAgentStub,
  artha_support: opsAgentStub,
  artha_sales: opsAgentStub,
  artha_analytics: opsAgentStub,
  artha_ops: opsAgentStub,
  artha_product: opsAgentStub,
  artha_community: opsAgentStub,
  shorts_pipeline: opsAgentStub,
  artha_video_growth: opsAgentStub,
};

function lowerCaseFirst(value: string): string {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

export function prepareWebsiteSubtasksForMissingSetup(
  subtasks: AgentSubtask[],
  websiteSetupRequired: boolean
): AgentSubtask[] {
  if (!websiteSetupRequired) return subtasks;

  return subtasks.map((subtask) => {
    if (subtask.agent !== "website_builder") return subtask;

    return {
      ...subtask,
      description: subtask.description
        ? `Set up the website and ${lowerCaseFirst(subtask.description)}`
        : "Set up the website and apply the requested changes",
      prompt: `This company does not have a website draft or live site yet.

First create the initial website setup from the current company context.
Then apply the requested website changes within that first draft.
Return a complete landing page draft that is ready for preview.

Requested website work:
${subtask.prompt}`,
    };
  });
}

// ── Intent classification ──────────────────────────────────────────

export async function classifyIntent(
  message: string,
  context: string,
  chatHistory?: string,
  activePanel?: string,
): Promise<DecomposedIntent> {
  type ClassificationResult = {
    type: IntentType;
    subtasks: {
      id?: string;
      agent: AgentName;
      prompt: string;
      description: string;
      dependsOn?: string[];
      dependsOnPrevious?: boolean;
    }[];
    directAnswer?: string;
  };

  const systemPrompt = `You are an AI orchestrator that routes user requests to specialized startup agents and crafts precise execution briefs for each.

Available agents and their capabilities:
- research: Company/market/competitor research, mission document generation, document updates, landscape analysis
- lead_finder: Find specific business leads, prospects, and contacts for sales outreach — performs web research, identifies decision-makers, and returns structured lead data
- website_builder: Build, edit, fix, or update websites/landing pages — includes ANY visual or structural change (layout, text, colors, fonts, spacing, headers, sections, buttons, images, forms, responsiveness, etc.)
- email_writer: Cold outreach emails, newsletters, product announcements, email replies
- task_generator: Strategic action plans with prioritized, executable tasks to grow the company
- twitter: Single tweets or multi-tweet threads for launches, updates, and brand building
- database_manager: Create, modify, or drop custom database tables for the user's website (subscriptions, credits, products, bookings, etc.). NOTE: Do NOT use for simple email/waitlist collection forms — those are handled by website_builder's built-in email capture form which stores to the free platform contacts table.
- stripe_agent: Set up pricing plans, configure Stripe payments, check revenue/earnings, manage Stripe Connect account, update pricing tiers

Intent types:
- "send_email": user wants to draft, write, or send any kind of email
- "build_website": user wants to build, redesign, update, or change their landing page/website. This INCLUDES adding waitlist forms, email capture forms, newsletter signups, or contact forms — these are website UI changes, NOT database operations.
- "research": user wants research, analysis, competitive intelligence, market data, or document creation
- "find_leads": user wants to find leads, prospects, contacts, or potential customers for outreach
- "tweet": user wants to compose or post a tweet or twitter thread
- "plan_tasks": user wants a prioritized plan, next steps, action items, or strategic roadmap
- "update_document": user wants to update or rewrite an existing document (mission, research, etc.)
- "manage_database": user wants to create CUSTOM database tables for structured data (subscription plans, credits, products, bookings, inventory, etc.). Do NOT classify simple email/waitlist collection as database work — the website builder already handles email capture forms with the built-in platform contacts table.
- "setup_payments": user wants to set up pricing, add payment plans, configure Stripe, check revenue/earnings, or manage their payment setup
- "general": conversational question, status check, or anything that does not require agent execution. IMPORTANT: If the user is asking to change, fix, update, adjust, or improve ANYTHING on their site/website/landing page (layout, text, colors, fonts, spacing, headers, sections, buttons, headers, etc.), that is ALWAYS "build_website" — never "general". Only classify as "general" if the user is asking a pure question with no implied action.
- "multi": request spans multiple agents (e.g. "do research then rebuild my website with the findings")

Routing rules:
- CRITICAL: Any request about the website/site/landing page (build, edit, redesign, change layout, single page, multi page, fix, update text/colors/sections, etc.) MUST route to "website_builder" — NEVER to "lead_finder" or "research". The word "site" or "page" in context of building/changing = website_builder.
- Only use "lead_finder" when the user EXPLICITLY asks to find leads, prospects, contacts, or potential customers. Never infer lead search from a website or research request.
- If the user wants to find leads/prospects/contacts, use "lead_finder" — only use "research" for general lead landscape research or market analysis
- If the user wants a waitlist form, email signup, newsletter form, or contact form on their website, route ONLY to "website_builder" — do NOT add a database_manager subtask. The website builder has a built-in email capture component that stores to the free platform contacts table automatically.
- Only route to "database_manager" when the user explicitly wants custom structured data tables (e.g. "create a subscription plans table", "add an inventory table", "set up a bookings database")
- If the request needs multiple agents, set type to "multi" and list each subtask
- If it needs one agent, set type to the matching intent with one subtask
- If it is a pure question or conversation with NO implied action request, set type to "general" with a directAnswer. When in doubt about whether the user wants advice vs action, ALWAYS default to action (route to the appropriate agent). Users expect you to DO things, not explain how to do them.

Dependency & parallelism rules:
- Each subtask MUST have a unique "id" field (use "s1", "s2", "s3", etc.)
- Each subtask MUST have a "dependsOn" array listing the IDs of subtasks whose output it needs
- If a subtask can run independently with no dependencies, set "dependsOn": []
- Subtasks with no dependencies on each other will run IN PARALLEL for faster execution
- Only add a dependency when the subtask genuinely needs the output of another subtask
- Example: "research competitors and tweet about launch" → research(s1, dependsOn:[]) and twitter(s2, dependsOn:[]) run in parallel
- Example: "research leads then email them" → research(s1, dependsOn:[]) runs first, then email_writer(s2, dependsOn:["s1"]) uses research results

CRITICAL — Writing the subtask prompt:
For each subtask, the "prompt" field is the primary instruction the agent will execute. Do NOT just paraphrase the user's message. Write a complete, specific agent brief that includes:
1. The exact goal and deliverable expected
2. Key requirements and constraints from the user's request
3. Any relevant details the agent needs (tone, audience, scope, format)
4. What success looks like for this specific task
The prompt should be self-contained — the agent only sees this prompt plus company context.

Return JSON: { type, subtasks: [{ id, agent, prompt, description, dependsOn }], directAnswer? }
${activePanel ? `\nContext: the user is currently viewing the "${activePanel}" tab. Use this as a soft hint to disambiguate when the request is ambiguous — but ALWAYS prioritize the actual content of the user's request. If they ask for research + website changes, route to multiple agents. The request itself is the top priority for routing, not the active tab.\n` : ""}${chatHistory ? `\nRecent conversation history (use this to understand references like "it", "that", "again", "the same thing", etc.):\n${chatHistory}\n` : ""}
Company context:
${context}`;

  const result = await generateAgentJSON<ClassificationResult>("intent_classification", systemPrompt, message);

  // Normalize subtasks — handle both old format (dependsOnPrevious) and new format (dependsOn)
  const subtasks: AgentSubtask[] = (result.subtasks || []).map((s, i) => {
    const id = s.id || `s${i + 1}`;
    let dependsOn: string[] = [];

    if (s.dependsOn && Array.isArray(s.dependsOn)) {
      dependsOn = s.dependsOn;
    } else if (s.dependsOnPrevious && i > 0) {
      // Backward compat: convert old boolean to ID reference
      const prevId = result.subtasks[i - 1]?.id || `s${i}`;
      dependsOn = [prevId];
    }

    return { id, agent: s.agent, prompt: s.prompt, description: s.description, dependsOn };
  });

  return {
    type: result.type || "general",
    subtasks,
    directAnswer: result.directAnswer,
  };
}

// ── Direct answer (no agent needed) ────────────────────────────────

export async function answerDirectly(
  message: string,
  context: string,
  chatHistory: string,
  onToken?: (chunk: string) => void,
): Promise<string> {
  const systemPrompt = `You are Artha, an AI chief of staff helping a startup founder run their company. You have deep knowledge of this company and think like a strategic advisor.

When answering:
- Give specific, actionable insight grounded in the company context — not generic startup advice
- Be direct and concise (8-10 lines max)
- If you can recommend a concrete next step, do it
- If you reference something from the company context, be specific (use actual names, numbers, details)
- If you don't have enough context to answer well, say so honestly and suggest what information would help

Company Context:
${context}

Recent conversation:
${chatHistory}`;

  if (onToken) {
    return generateAgentCompletionStreaming("direct_answer", systemPrompt, message, onToken, { maxTokens: 2000 });
  }
  return generateAgentCompletion("direct_answer", systemPrompt, message, { maxTokens: 2000 });
}

// ── Lead search proposal generator ──────────────────────────────────

async function generateLeadSearchProposal(
  message: string,
  context: string,
): Promise<string> {
  return generateAgentCompletion(
    "direct_answer",
    `You are Artha, an AI chief of staff. The user wants to find business leads. Based on their request and company context, generate a focused lead search plan for them to review before you run the search.

Your response should:
1. Briefly acknowledge what they want (1 line)
2. Present the plan under a heading "— Lead Search Plan —" with:
   - Target Profile: industries, company sizes, roles/titles to target
   - Search Focus: specific signals, technologies, or attributes to filter on
   - Expected Output: what data you'll gather (emails, LinkedIn, company info, fit scoring)
3. End by asking them to confirm ("Go ahead" / "Yes") or suggest adjustments

Keep it concise (8-14 lines). Be specific to the company — use actual details from context, not generic placeholders.

Company Context:
${context}`,
    message,
    { maxTokens: 800 }
  );
}

// ── Lead search confirmation detector ───────────────────────────────

async function detectLeadConfirmation(
  message: string,
  recentHistory: string,
): Promise<{ action: "confirm" | "adjust" | "unrelated"; extraDetails?: string }> {
  return generateAgentJSON<{ action: "confirm" | "adjust" | "unrelated"; extraDetails?: string }>(
    "intent_classification",
    `The assistant recently proposed a lead search plan. The user has now responded. Classify their response:

- "confirm": User approves/confirms the search (e.g. "yes", "go ahead", "looks good", "proceed", "do it", "perfect", "run it"). They may also add small extras like "yes, also include fintech" — still classify as "confirm" and put the extras in extraDetails.
- "adjust": User wants to significantly change the search criteria before running (e.g. "change target to VPs only", "focus on European companies", "no, I want healthcare instead").
- "unrelated": The message is not about the lead search at all.

Return JSON: { "action": "confirm"|"adjust"|"unrelated", "extraDetails": "any extra instructions or adjustments (optional)" }

Recent conversation for context:
${recentHistory}`,
    message
  );
}

// ── Build a lead search prompt from confirmed conversation ──────────

async function buildConfirmedLeadPrompt(
  confirmationMessage: string,
  chatHistory: string,
  context: string,
): Promise<string> {
  return generateAgentCompletion(
    "direct_answer",
    `Extract the lead search criteria from this conversation and produce a focused, actionable search prompt for a lead-finding AI agent.

The agent will use this prompt to search the web for real business leads. Include:
- Who to find (roles, titles, decision-makers)
- What companies to target (industry, size, stage, signals)
- Any specific criteria or filters mentioned
- Geographic focus if mentioned

Conversation:
${chatHistory}

User's confirmation: ${confirmationMessage}

Company Context (for background):
${context}`,
    "Create a comprehensive lead search prompt from the confirmed search plan above.",
    { maxTokens: 600 }
  );
}

// ── Topological sort into parallel execution layers ─────────────────

function buildExecutionLayers(subtasks: AgentSubtask[]): string[][] {
  const layers: string[][] = [];
  const assigned = new Set<string>();

  while (assigned.size < subtasks.length) {
    const layer: string[] = [];
    for (const subtask of subtasks) {
      if (assigned.has(subtask.id)) continue;
      const depsResolved = subtask.dependsOn.every((dep) => assigned.has(dep));
      if (depsResolved) layer.push(subtask.id);
    }
    if (layer.length === 0) {
      // Circular dependency — add remaining sequentially to avoid infinite loop
      const remaining = subtasks.filter((s) => !assigned.has(s.id)).map((s) => s.id);
      for (const id of remaining) {
        layers.push([id]);
        assigned.add(id);
      }
      break;
    }
    layers.push(layer);
    layer.forEach((id) => assigned.add(id));
  }

  return layers;
}

// ── Conditional Execution ─────────────────────────────────────────

function evaluateCondition(
  condition: import("./types").SubtaskCondition,
  outputs: Map<string, AgentOutput>,
): boolean {
  const sourceOutput = outputs.get(condition.sourceSubtaskId);
  if (!sourceOutput) return false; // Source hasn't completed — skip

  switch (condition.type) {
    case "output_contains": {
      const summary = sourceOutput.summary || "";
      return summary.toLowerCase().includes(String(condition.value).toLowerCase());
    }
    case "output_field_exists": {
      if (!condition.field) return false;
      const value = (sourceOutput as unknown as Record<string, unknown>)[condition.field];
      if (Array.isArray(value)) return value.length > 0;
      return value != null && value !== "";
    }
    case "custom": {
      // Safe evaluation: only support dot-path truthiness checks.
      // e.g., expression = "leads.length" checks sourceOutput.leads.length > 0
      // No arbitrary code execution — just property path traversal.
      try {
        if (!condition.expression) return false;
        const path = condition.expression.split(".");
        // Reject anything that looks like code (parens, brackets, semicolons, etc.)
        if (/[();\[\]{}=!<>+\-*/%&|^~?`,]/.test(condition.expression)) return false;
        let current: unknown = sourceOutput;
        for (const segment of path) {
          if (current == null || typeof current !== "object") return false;
          current = (current as Record<string, unknown>)[segment];
        }
        return !!current;
      } catch {
        return false;
      }
    }
    default:
      return true;
  }
}

// ── Dynamic Re-planning ──────────────────────────────────────────

async function evaluateReplan(
  completedOutputs: { subtaskId: string; agent: string; summary: string }[],
  allSubtasks: AgentSubtask[],
  plan: MultiAgentPlan,
  _context: string,
): Promise<{ skipSubtasks: string[]; reason: string } | null> {
  // Only re-plan if there are remaining layers with multiple subtasks
  const remainingIds = plan.willExecute.filter(
    (id) => !completedOutputs.some((o) => o.subtaskId === id),
  );
  if (remainingIds.length <= 1) return null;

  try {
    const result = await generateAgentJSON<{
      skipSubtasks: string[];
      reason: string;
    }>(
      "intent_classification", // Fast model (GPT-4o-mini)
      `You are an execution optimizer. Based on completed agent outputs, determine if any remaining subtasks should be SKIPPED because they are now redundant, unnecessary, or fully covered by completed work.

Only skip subtasks that are truly unnecessary. When in doubt, DO NOT skip.

Return JSON: { "skipSubtasks": ["id1"], "reason": "brief reason" }
If nothing should be skipped, return: { "skipSubtasks": [], "reason": "all remaining tasks are still needed" }`,
      `Completed outputs:
${completedOutputs.map((o) => `- [${o.subtaskId}] ${o.agent}: ${o.summary}`).join("\n")}

Remaining subtasks:
${remainingIds.map((id) => {
  const s = allSubtasks.find((st) => st.id === id);
  return s ? `- [${s.id}] ${s.agent}: ${s.description}` : "";
}).filter(Boolean).join("\n")}`,
      { maxTokens: 300 },
    );
    return result.skipSubtasks.length > 0 ? result : null;
  } catch {
    return null;
  }
}

// ── Build execution plan ───────────────────────────────────────────

export function buildPlan(
  subtasks: AgentSubtask[],
  creditsAvailable: number,
  freeWebsiteBuildAvailable: boolean = false
): MultiAgentPlan {
  const agents = subtasks.map((s) => s.agent);
  const executionLayers = buildExecutionLayers(subtasks);

  // Count total credits required (weighted by agent type)
  let creditsRequired = 0;
  let freeWebsiteBudgetForRequired = freeWebsiteBuildAvailable;
  for (const subtask of subtasks) {
    const isFreeWebsiteTask = subtask.agent === "website_builder" && freeWebsiteBudgetForRequired;
    if (isFreeWebsiteTask) {
      freeWebsiteBudgetForRequired = false;
      continue;
    }
    creditsRequired += getCreditCost(subtask.agent);
  }

  // Determine which subtasks can execute within credit budget
  const willExecute: string[] = [];
  const deferred: string[] = [];
  let creditsBudget = creditsAvailable;
  let freeWebsiteBudgetForExecution = freeWebsiteBuildAvailable;
  const subtaskMap = new Map(subtasks.map((s) => [s.id, s]));

  for (const layer of executionLayers) {
    for (const subtaskId of layer) {
      const subtask = subtaskMap.get(subtaskId)!;
      const isFreeWebsiteTask = subtask.agent === "website_builder" && freeWebsiteBudgetForExecution;
      const creditsNeeded = isFreeWebsiteTask ? 0 : getCreditCost(subtask.agent);

      if (creditsNeeded > creditsBudget) {
        deferred.push(subtaskId);
        continue;
      }

      if (isFreeWebsiteTask) {
        freeWebsiteBudgetForExecution = false;
      } else {
        creditsBudget -= creditsNeeded;
      }
      willExecute.push(subtaskId);
    }
  }

  return { agents, subtasks, executionLayers, creditsRequired, creditsAvailable, willExecute, deferred };
}

// ── Execute agents (parallel DAG execution) ─────────────────────────

export async function executeAgents(params: {
  subtasks: AgentSubtask[];
  plan: MultiAgentPlan;
  projectId: string;
  userId: string;
  context: string;
  freeWebsiteBuildAvailable?: boolean;
  metadata?: Record<string, unknown>;
  emit: SSEWriter;
  signal?: AbortSignal;
}): Promise<ExecutionSummary> {
  const { subtasks, plan, projectId, userId, context, freeWebsiteBuildAvailable, metadata, emit, signal } = params;
  const db = getDb();

  const subtaskMap = new Map(subtasks.map((s) => [s.id, s]));
  const willExecuteSet = new Set(plan.willExecute);

  // Create shared execution scratchpad for cross-agent context sharing
  const scratchpad = new ExecutionScratchpad();

  // Emit task breakdown for all agent flows (including single-agent)
  if (subtasks.length >= 1) {
    const breakdownItems: SubtaskBreakdownItem[] = subtasks.map((s) => ({
      id: s.id,
      agent: s.agent,
      description: s.description,
      status: willExecuteSet.has(s.id) ? "pending" as const : "pending" as const,
    }));

    emit({
      event: "tasks_breakdown",
      data: { subtasks: breakdownItems },
    });
  }

  // Legacy plan event for backward compat
  emit({
    event: "plan",
    data: {
      agents: plan.agents,
      creditsRequired: plan.creditsRequired,
      creditsAvailable: plan.creditsAvailable,
      willExecute: plan.willExecute,
      deferred: plan.deferred,
    },
  });

  const completed: AgentDoneResult[] = [];
  let creditsUsed = 0;
  let creditsRemaining = plan.creditsAvailable;
  let freeWebsiteBuildRemaining = Boolean(freeWebsiteBuildAvailable);
  let usedFreeWebsiteBuild = false;

  // Store outputs keyed by subtask ID for dependency injection
  const outputs = new Map<string, AgentOutput>();
  const failedSubtasks = new Set<string>();
  let globalAgentIndex = 0;

  // Execute layer by layer — subtasks within a layer run in parallel
  for (let layerIdx = 0; layerIdx < plan.executionLayers.length; layerIdx++) {
    // Check abort signal between layers
    if (signal?.aborted) {
      // Mark remaining subtasks as cancelled
      for (let ri = layerIdx; ri < plan.executionLayers.length; ri++) {
        for (const id of plan.executionLayers[ri]) {
          if (!outputs.has(id) && !failedSubtasks.has(id)) {
            emit({ event: "subtask_status", data: { subtaskId: id, status: "cancelled" } });
          }
        }
      }
      break;
    }
    const layer = plan.executionLayers[layerIdx];
    const layerSubtaskIds = layer.filter((id) => {
      if (!willExecuteSet.has(id)) return false;

      const subtask = subtaskMap.get(id)!;

      // Check if any dependency failed — if so, skip this subtask
      const hasBrokenDep = subtask.dependsOn.some((depId) => failedSubtasks.has(depId));
      if (hasBrokenDep) {
        failedSubtasks.add(id);
        emit({
          event: "subtask_status",
          data: { subtaskId: id, status: "failed", error: "Skipped: a required preceding task failed" },
        });
        return false;
      }

      // Check conditional execution
      if (subtask.condition) {
        const conditionMet = evaluateCondition(subtask.condition, outputs);
        if (!conditionMet) {
          emit({
            event: "subtask_status",
            data: { subtaskId: id, status: "skipped", error: "Condition not met" },
          });
          return false;
        }
      }

      return true;
    });

    if (layerSubtaskIds.length === 0) continue;

    // Run all subtasks in this layer in parallel
    const layerPromises = layerSubtaskIds.map(async (subtaskId) => {
      const subtask = subtaskMap.get(subtaskId)!;
      globalAgentIndex++;
      const agentIndex = globalAgentIndex;

      // Emit running status
      emit({
        event: "subtask_status",
        data: { subtaskId, status: "running" },
      });

      // Legacy events
      emit({
        event: "agent_start",
        data: {
          agent: subtask.agent,
          agentIndex,
          totalAgents: plan.willExecute.length,
          step: subtask.description,
        },
      });

      emit({
        event: "thinking",
        data: { step: subtask.description, agent: subtask.agent },
      });

      // Build enriched prompt from dependency outputs
      let enrichedPrompt = subtask.prompt;
      if (subtask.dependsOn.length > 0) {
        const depOutputs = subtask.dependsOn
          .map((depId) => outputs.get(depId))
          .filter(Boolean) as AgentOutput[];

        if (depOutputs.length > 0) {
          const depContext = depOutputs
            .map(
              (o) =>
                `━━━ OUTPUT FROM ${o.agent.toUpperCase()} ━━━\nResult: ${o.summary}${o.documents?.length ? `\nDocuments produced: ${o.documents.map((d) => `"${d.title}" (${d.type})`).join(", ")}` : ""}`
            )
            .join("\n\n");

          enrichedPrompt = `${subtask.prompt}\n\n${depContext}\n\nUse the above outputs to directly inform and enrich your work. Build on them, reference specific details, and ensure your output is coherent and additive — not redundant.`;
        }
      }

      // For website_builder, fetch existing site HTML so the agent can edit incrementally
      let agentMetadata: Record<string, unknown> = { ...metadata, executionSource: "chat" };
      if (subtask.agent === "website_builder") {
        try {
          const [website, extraPages] = await Promise.all([
            getProjectWebsite(projectId),
            getAllProjectPages(projectId),
          ]);
          if (website.previewHtml) {
            agentMetadata = { ...agentMetadata, existingHtml: website.previewHtml, existingPages: extraPages };
          }
        } catch {
          // No existing website — agent will use initial generation mode
        }
      }

      const input: AgentInput = {
        prompt: enrichedPrompt,
        context,
        projectId,
        userId,
        metadata: agentMetadata,
        scratchpad,
        onProgress: (message: string) => {
          emit({
            event: "subtask_thinking",
            data: { subtaskId, message },
          });
        },
        onToken: (chunk: string) => {
          emit({
            event: "agent_stream",
            data: { subtaskId, agent: subtask.agent, chunk },
          });
        },
      };

      try {
        const runner = AGENT_RUNNERS[subtask.agent];
        let output = await runner(input);

        outputs.set(subtaskId, output);

        // Check if agent returned a failure (success: false) — report and move on
        if (!output.success) {
          failedSubtasks.add(subtaskId);
          emit({
            event: "subtask_status",
            data: { subtaskId, status: "failed", error: output.error || output.summary || "Agent failed" },
          });
          console.error(`Agent ${subtask.agent} (${subtaskId}) failed:`, output.error || output.summary);
          return; // Skip credit deduction for failed agents
        }

        // Handle credits — only deduct for successful agents
        const isFreeWebsiteBuild = subtask.agent === "website_builder" && freeWebsiteBuildRemaining;
        if (isFreeWebsiteBuild) {
          freeWebsiteBuildRemaining = false;
          usedFreeWebsiteBuild = true;
        }
        if (!isFreeWebsiteBuild) {
          const cost = getCreditCost(subtask.agent);
          await decrementProjectCredits(db, projectId, cost);
          creditsUsed += cost;
          creditsRemaining = Math.max(creditsRemaining - cost, 0);
        }

        await persistAgentOutput(projectId, userId, output);

        const agentResult: AgentDoneResult = {
          subtaskId,
          agent: subtask.agent,
          agentIndex,
          summary: output.summary,
          links: output.links || [],
          creditsRemaining,
        };
        completed.push(agentResult);

        // Emit completed status
        emit({
          event: "subtask_status",
          data: { subtaskId, status: "completed", summary: output.summary, links: output.links || [] },
        });

        // Legacy event
        emit({
          event: "agent_done",
          data: agentResult as unknown as Record<string, unknown>,
        });

        // Task creation events
        if (output.tasksCreated?.length) {
          for (const task of output.tasksCreated) {
            emit({
              event: "task_created",
              data: { title: task.title, tag: task.tag, agent: task.agent },
            });
          }
        }

        // Lead creation events
        if (output.leads?.length) {
          emit({
            event: "leads_created",
            data: { count: output.leads.length, agent: subtask.agent },
          });
        }
      } catch (error) {
        failedSubtasks.add(subtaskId);
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        emit({
          event: "subtask_status",
          data: { subtaskId, status: "failed", error: errorMsg },
        });
        console.error(`Agent ${subtask.agent} (${subtaskId}) failed:`, error);
      }
    });

    // Wait for all subtasks in this layer before moving to next
    await Promise.allSettled(layerPromises);

    // ── Dynamic Re-planning ──────────────────────────────────────
    // After each layer (except the last), check if we should adapt the plan
    const currentLayerIndex = plan.executionLayers.indexOf(layer);
    const hasMoreLayers = currentLayerIndex < plan.executionLayers.length - 1;
    const completedOutputs = Array.from(outputs.entries())
      .map(([id, o]) => ({ subtaskId: id, agent: o.agent, summary: o.summary }));

    if (hasMoreLayers && completedOutputs.length > 0) {
      try {
        const replanResult = await evaluateReplan(completedOutputs, subtasks, plan, context);
        if (replanResult && replanResult.skipSubtasks.length > 0) {
          // Mark skipped subtasks
          for (const skipId of replanResult.skipSubtasks) {
            willExecuteSet.delete(skipId);
            emit({
              event: "subtask_status",
              data: { subtaskId: skipId, status: "skipped", error: "Skipped by dynamic re-planning" },
            });
          }
          emit({
            event: "replan",
            data: { skipped: replanResult.skipSubtasks, reason: replanResult.reason },
          });
        }
      } catch {
        // Re-planning failure is non-critical — continue with original plan
      }
    }
  }

  // Handle deferred subtasks
  if (plan.deferred.length > 0) {
    const deferredSubtasks = plan.deferred
      .map((id) => subtaskMap.get(id))
      .filter(Boolean) as AgentSubtask[];

    emit({
      event: "credits_exhausted",
      data: {
        completed: plan.willExecute,
        deferred: plan.deferred,
        creditsUsed,
        creditsNeeded: plan.deferred.length,
        purchaseUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://artha.run"}/dashboard?buy_credits=true`,
        subscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://artha.run"}/dashboard?buy_credits=true`,
      },
    });

    await queueDeferredAgents(projectId, deferredSubtasks);
  }

  const totalAgents = plan.agents.length;
  const failedCount = failedSubtasks.size;
  const showCreditPrompt = plan.deferred.length > 0;
  let message: string;
  if (completed.length === 0 && failedCount > 0) {
    message = `Sorry, ${failedCount === 1 ? "the task" : `all ${failedCount} tasks`} failed. Please try again or rephrase your request.`;
  } else if (failedCount > 0 && completed.length > 0) {
    message = `${completed.length} of ${totalAgents} tasks completed. ${failedCount} ${failedCount === 1 ? "task" : "tasks"} failed.`;
  } else if (showCreditPrompt) {
    message = `Done! ${completed.length} of ${totalAgents} tasks completed.`;
  } else {
    message = `Done! ${completed.length === 1 ? "Task" : `All ${completed.length} tasks`} completed.`;
  }
  const messageWithFreeWebsiteNote = usedFreeWebsiteBuild
    ? `${message} Your first website build was free (0 credits).`
    : message;

  // Build deferred info using subtask agent names
  const deferredInfo = plan.deferred.map((id) => {
    const subtask = subtaskMap.get(id);
    return { agent: subtask?.agent || ("unknown" as AgentName), reason: "out_of_credits" };
  });

  const summary: ExecutionSummary = {
    message: messageWithFreeWebsiteNote,
    completed,
    deferred: deferredInfo,
    failedCount,
    creditsUsed,
    creditsRemaining,
    showCreditPrompt,
  };

  return summary;
}

// ── Persist agent output to DB + Supermemory ───────────────────────

export async function persistAgentOutput(projectId: string, userId: string, output: AgentOutput): Promise<void> {
  if (!output.success) return;

  try {
    const db = getDb();

    // Save documents (capture IDs for lead linking)
    // Skip fallback "output" docs — those are raw agent text, not real documents
    const savedDocIds: string[] = [];
    if (output.documents?.length) {
      for (const doc of output.documents) {
        if (doc.type === "output" && doc.title === "Agent Output") continue;
        const rows = await db`
          INSERT INTO documents (project_id, type, title, content, metadata)
          VALUES (${projectId}, ${doc.type}, ${doc.title}, ${doc.content}, ${JSON.stringify(doc.metadata || {})}::jsonb)
          RETURNING id
        `;
        if (rows[0]?.id) savedDocIds.push(rows[0].id as string);
      }
    }

    // Save tasks
    if (output.tasksCreated?.length) {
      for (const task of output.tasksCreated) {
        await db`
          INSERT INTO tasks (project_id, type, title, description, status, source, tag, agent)
          VALUES (${projectId}, ${task.type}, ${task.title}, ${task.description}, 'queued', 'agent', ${task.tag}, ${task.agent})
        `;
      }
    }

    // Save pages
    if (output.pages?.length) {
      for (const page of output.pages) {
        if (output.agent === "website_builder") {
          // Validate script syntax before persisting — catches JSX in plain <script>, broken HTML, etc.
          const pageValidation = validateLandingPage(page.html);
          if (!pageValidation.valid) {
            console.error(`[orchestrator] Refusing to save page "${page.slug}" due to validation errors:`, pageValidation.errors);
            throw new Error(`Website has script errors that need to be fixed: ${pageValidation.errors.join("; ")}`);
          }
          await saveWebsiteDraft({
            projectId,
            title: page.title,
            html: page.html,
            slug: page.slug,
          });
        } else {
          await db`
            UPDATE projects SET landing_page_html = ${page.html}, landing_page_published = TRUE
            WHERE id = ${projectId}
          `;
        }
      }
    }

    // Save tweets
    if (output.tweets?.length) {
      for (const tweet of output.tweets) {
        await db`
          INSERT INTO tweets (project_id, content, status)
          VALUES (${projectId}, ${tweet.content}, 'draft')
        `;
      }
    }

    // Save leads
    if (output.leads?.length) {
      const sourceDocId = savedDocIds[0] || null;
      for (const lead of output.leads) {
        await db`
          INSERT INTO leads (project_id, name, email, linkedin_url, company, role, phone, website, source, source_research_id, score, notes, tags, metadata)
          VALUES (
            ${projectId},
            ${lead.name},
            ${lead.email || null},
            ${lead.linkedin_url || null},
            ${lead.company},
            ${lead.role || null},
            ${lead.phone || null},
            ${lead.website || null},
            ${lead.source || "lead_finder"},
            ${sourceDocId},
            ${lead.score},
            ${lead.notes || null},
            ${lead.tags || []},
            ${JSON.stringify(lead.metadata || {})}::jsonb
          )
        `;
      }
    }

    // Ingest to Supermemory
    if (output.supermemoryIngestions?.length) {
      for (const ingestion of output.supermemoryIngestions) {
        await ingestMemory({
          content: ingestion.content,
          containerTag: companyTag(projectId),
          dedupeKey: ingestion.dedupeKey,
          projectId,
          userId,
          customId: ingestion.customId,
          metadata: ingestion.metadata as Record<string, string | number | boolean> | undefined,
        }).catch(() => {});
      }
    }

    // Update memory key-value store (now uses projectId directly)
    if (output.memoryUpdates?.length) {
      for (const update of output.memoryUpdates) {
        await setCompanyMemory(projectId, update.key, update.value);
      }
    }

    // Handle schema operations (database_manager agent) — sync Stripe plans if needed
    if (output.schemaOperations?.length) {
      const planOp = output.schemaOperations.find(
        (op) =>
          op.operation === "create_table" &&
          op.table === "subscription_plans" &&
          (op.seedData as unknown[] | undefined)?.length
      );
      if ((planOp?.seedData as unknown[] | undefined)?.length) {
        try {
          const plans = (planOp!.seedData as Record<string, unknown>[]).map((row) => ({
            name: String(row.name || ""),
            price: String(row.price_cents ? `$${(row.price_cents as number) / 100}` : row.price || "0"),
            period: String(row.interval || "month"),
            features: Array.isArray(row.features) ? row.features as string[] : [],
            ctaText: String(row.cta_text || "Get started"),
          }));
          await syncProjectPricingPlans({ projectId, userId, plans });
        } catch (err) {
          console.error("Failed to sync Stripe pricing plans:", err);
        }
      }
    }
  } catch (error) {
    console.error("Persist agent output error:", error);
  }
}

// ── Queue deferred agents as tasks ─────────────────────────────────

async function queueDeferredAgents(projectId: string, deferredSubtasks: AgentSubtask[]): Promise<void> {
  try {
    const db = getDb();
    for (const subtask of deferredSubtasks) {
      const tagMap: Record<AgentName, string> = {
        research: "research",
        website_builder: "engineering",
        email_writer: "cold-outreach",
        task_generator: "content",
        twitter: "social",
        lead_finder: "cold-outreach",
        database_manager: "engineering",
        stripe_agent: "engineering",
        email_replier: "email",
        content_planner: "social",
        analytics_agent: "analytics",
        competitive_monitor: "research",
        seo_agent: "seo",
        blog_writer: "content",
        video_generator: "content",
        social_media_manager: "social",
        sales_sequencer: "cold-outreach",
        artha_growth: "marketing",
        artha_support: "content",
        artha_sales: "marketing",
        artha_analytics: "analytics",
        artha_ops: "engineering",
        artha_product: "research",
        artha_community: "social",
        shorts_pipeline: "content",
        artha_video_growth: "content",
      };
      await db`
        INSERT INTO tasks (project_id, type, title, description, status, source, tag, agent, prompt)
        VALUES (${projectId}, 'custom', ${subtask.description}, ${subtask.prompt}, 'queued', 'deferred', ${tagMap[subtask.agent] || "content"}, ${subtask.agent}, ${subtask.prompt})
      `;
    }
  } catch (error) {
    console.error("Queue deferred agents error:", error);
  }
}

// ── Full orchestration entry point (for chat) ──────────────────────

export async function orchestrateChat(params: {
  projectId: string;
  userId: string;
  message: string;
  chatHistory: string;
  creditsAvailable: number;
  freeWebsiteBuildAvailable?: boolean;
  metadata?: Record<string, unknown>;
  contextPromise?: Promise<string>;
  emit: SSEWriter;
  signal?: AbortSignal;
}): Promise<ExecutionSummary | { directAnswer: string; skipCreditCharge?: boolean }> {
  const {
    projectId,
    userId,
    message,
    chatHistory,
    creditsAvailable,
    freeWebsiteBuildAvailable = false,
    metadata,
    contextPromise,
    emit,
    signal,
  } = params;

  const activePanel = metadata?.activePanel as string | undefined;

  emit({ event: "thinking", data: { step: "Understanding your request..." } });

  const context = contextPromise
    ? await contextPromise
    : await buildChatContext({ projectId, userId, userMessage: message });

  // ── Lead search confirmation flow ──────────────────────────────────
  // If a previous message proposed a lead search plan, check if user is
  // confirming, adjusting, or asking something unrelated.
  const hasLeadProposal = chatHistory.includes("— Lead Search Plan —");
  if (hasLeadProposal) {
    emit({ event: "thinking", data: { step: "Processing your response...", agent: "orchestrator" } });
    const confirmation = await detectLeadConfirmation(message, chatHistory);

    if (confirmation.action === "confirm") {
      emit({ event: "thinking", data: { step: "Starting lead search...", agent: "lead_finder" } });
      const leadPrompt = await buildConfirmedLeadPrompt(message, chatHistory, context);
      const extra = confirmation.extraDetails ? `\n\nAdditional instructions: ${confirmation.extraDetails}` : "";

      if (creditsAvailable <= 0) {
        const leadCost = getCreditCost("lead_finder");
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://artha.run";
        emit({
          event: "plan_preview",
          data: {
            tasks: ["Finding leads based on your approved search plan"],
            totalCreditsRequired: leadCost,
            creditsAvailable: 0,
            shortfall: leadCost,
            purchaseUrl: `${appUrl}/dashboard?buy_credits=true`,
          },
        });
        return {
          directAnswer: `This request requires ${leadCost} credit${leadCost !== 1 ? "s" : ""} to complete, but you have 0 available.\n\n[Get Credits]`,
          skipCreditCharge: true,
        };
      }

      const subtask: AgentSubtask = {
        id: "s1",
        agent: "lead_finder" as AgentName,
        prompt: leadPrompt + extra,
        description: "Finding leads based on your approved search plan",
        dependsOn: [],
      };
      const plan = buildPlan([subtask], creditsAvailable, freeWebsiteBuildAvailable);
      return executeAgents({
        subtasks: [subtask],
        plan,
        projectId,
        userId,
        context,
        freeWebsiteBuildAvailable,
        metadata,
        emit,
        signal,
      });
    }

    if (confirmation.action === "adjust") {
      const adjustedProposal = await generateLeadSearchProposal(message, context);
      return { directAnswer: adjustedProposal };
    }

    // "unrelated" — fall through to normal classification
  }

  emit({ event: "thinking", data: { step: "Analyzing your request..." } });
  const classifiedIntent = await classifyIntent(message, context, chatHistory, activePanel);

  const intent = {
    ...classifiedIntent,
    subtasks: prepareWebsiteSubtasksForMissingSetup(
      classifiedIntent.subtasks,
      freeWebsiteBuildAvailable
    ),
  };

  // Direct answer — no agent needed, free
  if (intent.type === "general") {
    // Stream the direct answer text live
    const answer = intent.directAnswer || await answerDirectly(message, context, chatHistory, (chunk) => {
      emit({ event: "direct_answer_stream", data: { chunk } });
    });
    if (!answer) {
      console.warn("[orchestrateChat] Empty response from LLM for message:", message.slice(0, 100));
      return { directAnswer: "I had trouble processing that request. Could you try again?" };
    }
    return { directAnswer: answer };
  }

  // ── Lead search proposal (first-time, single-agent find_leads) ────
  // Instead of running immediately, present a search plan for user approval.
  // Skip if user explicitly says "no instructions" / "just do it" / etc.
  // Safety: only show lead proposal if the user's message actually mentions leads/prospects/contacts
  // to prevent misclassification from triggering an unwanted lead search flow.
  const leadKeywordPattern = /\b(lead|leads|prospect|prospects|contact|contacts|outreach|sales list|find (me |us )?(people|companies|businesses|customers|clients))\b/i;
  const allLeadSubtasks = intent.subtasks.length >= 1 && intent.subtasks.every((s) => s.agent === "lead_finder");
  if (allLeadSubtasks && !leadKeywordPattern.test(message)) {
    // Misclassification: classified as lead_finder but user didn't mention leads.
    // Re-classify with a stronger hint to avoid the same mistake.
    console.warn("[orchestrateChat] Lead finder classified but no lead keywords in message, re-classifying:", message.slice(0, 100));
    const reclassified = await classifyIntent(
      `[IMPORTANT: The user is NOT asking about leads/prospects/contacts. Route to the correct agent based on their actual request.]\n\n${message}`,
      context, chatHistory, activePanel
    );
    intent.type = reclassified.type;
    intent.subtasks = prepareWebsiteSubtasksForMissingSetup(reclassified.subtasks, freeWebsiteBuildAvailable);
    intent.directAnswer = reclassified.directAnswer;
  } else if (allLeadSubtasks && leadKeywordPattern.test(message)) {
    const skipPattern = /\b(no instruction|no extra|just find|just do it|skip confirm|go ahead|don't ask|without asking|directly|immediately|no need to confirm)\b/i;
    if (!skipPattern.test(message)) {
      emit({ event: "thinking", data: { step: "Preparing search plan...", agent: "orchestrator" } });
      const proposal = await generateLeadSearchProposal(message, context);
      return { directAnswer: proposal };
    }
  }

  // Re-check if it became "general" after re-classification
  if (intent.type === "general") {
    const answer = intent.directAnswer || await answerDirectly(message, context, chatHistory, (chunk) => {
      emit({ event: "direct_answer_stream", data: { chunk } });
    });
    return { directAnswer: answer || "I had trouble processing that request. Could you try again?" };
  }

  const hasFreeWebsiteTask = freeWebsiteBuildAvailable && intent.subtasks.some((task) => task.agent === "website_builder");

  // No credits at all (unless first website build is available for free)
  if (creditsAvailable <= 0 && !hasFreeWebsiteTask) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://artha.run";
    const taskDescriptions = intent.subtasks.map((s) => s.description);
    const totalCreditsNeeded = intent.subtasks.reduce((sum, s) => sum + getCreditCost(s.agent), 0);

    emit({
      event: "plan_preview",
      data: {
        tasks: taskDescriptions,
        totalCreditsRequired: totalCreditsNeeded,
        creditsAvailable: 0,
        shortfall: totalCreditsNeeded,
        purchaseUrl: `${appUrl}/dashboard?buy_credits=true`,
      },
    });

    const planBreakdown = taskDescriptions.map((desc, i) => `${i + 1}. ${desc}`).join("\n");

    return {
      directAnswer: [
        `This request requires ${totalCreditsNeeded} credit${totalCreditsNeeded !== 1 ? "s" : ""} to complete, but you have 0 available.`,
        "",
        "Here's what needs to run:",
        planBreakdown,
        "",
        `You need ${totalCreditsNeeded} credit${totalCreditsNeeded !== 1 ? "s" : ""}.`,
        `[Get Credits]`,
      ].join("\n"),
      skipCreditCharge: true,
    };
  }

  // Build plan and check if all tasks can execute
  const plan = buildPlan(intent.subtasks, creditsAvailable, freeWebsiteBuildAvailable);

  // All-or-nothing: if any subtasks are deferred, don't execute anything
  if (plan.deferred.length > 0) {
    const subtaskMap = new Map(intent.subtasks.map((s) => [s.id, s]));
    const taskDescriptions = intent.subtasks.map((s) => s.description);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://artha.run";

    emit({
      event: "plan_preview",
      data: {
        tasks: taskDescriptions,
        totalCreditsRequired: plan.creditsRequired,
        creditsAvailable: plan.creditsAvailable,
        shortfall: Math.max(plan.creditsRequired - plan.creditsAvailable, 0),
        purchaseUrl: `${appUrl}/dashboard?buy_credits=true`,
      },
    });

    const planBreakdown = taskDescriptions.map((desc, i) => `${i + 1}. ${desc}`).join("\n");
    const shortfall = Math.max(plan.creditsRequired - plan.creditsAvailable, 0);

    const directAnswer = [
      `This request requires ${plan.creditsRequired} credit${plan.creditsRequired !== 1 ? "s" : ""} to complete, but you have ${plan.creditsAvailable} available.`,
      "",
      "Here's what needs to run:",
      planBreakdown,
      "",
      `You need ${shortfall.toFixed(1)} more credit${shortfall !== 1 ? "s" : ""}.`,
      `[Get Credits]`,
    ].join("\n");

    return { directAnswer, skipCreditCharge: true };
  }

  return executeAgents({
    subtasks: intent.subtasks,
    plan,
    projectId,
    userId,
    context,
    freeWebsiteBuildAvailable,
    metadata,
    emit,
    signal,
  });
}

// ── Orchestration entry point (for email) ──────────────────────────

export async function orchestrateEmail(params: {
  projectId: string;
  userId: string;
  emailBody: string;
  subject: string;
  creditsAvailable: number;
  freeWebsiteBuildAvailable?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<{ output: AgentOutput | null; directAnswer?: string; noCredits?: boolean }> {
  const context = await buildChatContext({
    projectId: params.projectId,
    userId: params.userId,
    userMessage: params.emailBody,
  });

  const classifiedIntent = await classifyIntent(params.emailBody, context);
  const intent = {
    ...classifiedIntent,
    subtasks: prepareWebsiteSubtasksForMissingSetup(
      classifiedIntent.subtasks,
      Boolean(params.freeWebsiteBuildAvailable)
    ),
  };

  if (intent.type === "general") {
    const answer = intent.directAnswer || await answerDirectly(params.emailBody, context, "");
    return { output: null, directAnswer: answer };
  }

  // For email, execute only the first subtask (single agent per email)
  const subtask = intent.subtasks[0];
  if (!subtask) {
    const answer = await answerDirectly(params.emailBody, context, "");
    return { output: null, directAnswer: answer };
  }

  const canUseFreeWebsiteBuild = Boolean(
    params.freeWebsiteBuildAvailable && subtask.agent === "website_builder"
  );
  if (params.creditsAvailable < getCreditCost(subtask.agent) && !canUseFreeWebsiteBuild) {
    return { output: null, noCredits: true };
  }

  const runner = AGENT_RUNNERS[subtask.agent];
  const input: AgentInput = {
    prompt: subtask.prompt,
    context,
    projectId: params.projectId,
    userId: params.userId,
    metadata: params.metadata,
  };

  const output = await runner(input);
  await persistAgentOutput(params.projectId, params.userId, output);

  // Decrement credit (weighted by agent type)
  if (!canUseFreeWebsiteBuild) {
    const db = getDb();
    await decrementProjectCredits(db, params.projectId, getCreditCost(subtask.agent));
  }

  return { output };
}
