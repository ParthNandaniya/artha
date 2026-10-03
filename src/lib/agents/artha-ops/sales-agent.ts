import { getDb } from "@/lib/neon";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { runOpsAgent } from "./runner";
import { getUserSegments } from "./tools/platform-metrics";
import type { OpsAction } from "./types";

interface SalesAction {
  userId: string;
  email: string;
  name: string | null;
  actionType: string;
  subject: string;
  body: string;
}

async function getHighEngagementFreeUsers() {
  const db = getDb();
  return db`
    SELECT u.id, u.email, u.name, p.name AS project_name, p.slug,
           COUNT(DISTINCT t.id)::int AS tasks_completed,
           COUNT(DISTINCT cm.id)::int AS chat_messages
    FROM users u
    JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks t ON t.project_id = p.id AND t.status = 'completed'
    LEFT JOIN chat_messages cm ON cm.project_id = p.id AND cm.role = 'user'
    WHERE p.subscription_status = 'none'
      AND p.status = 'active'
    GROUP BY u.id, u.email, u.name, p.name, p.slug
    HAVING COUNT(DISTINCT t.id) >= 3 OR COUNT(DISTINCT cm.id) >= 10
    LIMIT 15
  `;
}

async function getLowCreditSubscribers() {
  const db = getDb();
  return db`
    SELECT u.id, u.email, u.name, p.name AS project_name, p.task_credits
    FROM users u
    JOIN projects p ON p.user_id = u.id
    WHERE p.subscription_status = 'active'
      AND p.task_credits <= 5
      AND p.task_credits > 0
    LIMIT 10
  `;
}

async function getRecentlyChurned() {
  const db = getDb();
  return db`
    SELECT u.id, u.email, u.name, p.name AS project_name,
           COUNT(DISTINCT t.id)::int AS total_tasks
    FROM users u
    JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks t ON t.project_id = p.id AND t.status = 'completed'
    WHERE p.subscription_status = 'cancelled'
      AND EXISTS (
        SELECT 1 FROM subscriptions s
        WHERE s.project_id = p.id AND s.cancelled_at >= NOW() - INTERVAL '14 days'
      )
    GROUP BY u.id, u.email, u.name, p.name
    LIMIT 10
  `;
}

async function wasContactedRecently(userId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db`
    SELECT 1 FROM artha_ops_approvals
    WHERE payload->>'userId' = ${userId}
      AND agent_name = 'artha_sales'
      AND created_at >= NOW() - INTERVAL '7 days'
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function runSalesAgent(trigger: "cron" | "manual" = "cron") {
  return runOpsAgent("artha_sales", trigger, null, async () => {
    const highEngagement = await getHighEngagementFreeUsers();
    const lowCredit = await getLowCreditSubscribers();
    const churned = await getRecentlyChurned();
    const actions: OpsAction[] = [];

    let tokensInput = 0;
    let tokensOutput = 0;

    // Nothing to do
    if (highEngagement.length === 0 && lowCredit.length === 0 && churned.length === 0) {
      return {
        success: true,
        agent: "artha_sales" as const,
        summary: "No sales actions needed this cycle",
        actions: [],
        tokensUsed: { input: 0, output: 0 },
      };
    }

    // Filter out recently contacted users
    const targets: { type: string; user: Record<string, unknown> }[] = [];

    for (const u of highEngagement) {
      if (!(await wasContactedRecently(u.id as string))) {
        targets.push({ type: "upgrade_nudge", user: u as Record<string, unknown> });
      }
    }
    for (const u of lowCredit) {
      if (!(await wasContactedRecently(u.id as string))) {
        targets.push({ type: "credit_alert", user: u as Record<string, unknown> });
      }
    }
    for (const u of churned) {
      if (!(await wasContactedRecently(u.id as string))) {
        targets.push({ type: "win_back", user: u as Record<string, unknown> });
      }
    }

    if (targets.length === 0) {
      return {
        success: true,
        agent: "artha_sales" as const,
        summary: "All potential targets were contacted recently — skipping",
        actions: [],
        tokensUsed: { input: 0, output: 0 },
      };
    }

    // Generate personalized emails
    const emailDrafts = await generateAgentJSON<{ emails: SalesAction[] }>(
      "artha_sales",
      `You are a thoughtful sales assistant for Artha, an AI company builder ($49/mo, 35 credits/month).
Generate personalized, non-pushy emails for each target user.

Email types:
- upgrade_nudge: Highlight what they've built, mention features they'd unlock with Pro
- credit_alert: Let them know credits are running low, suggest a credit pack ($25 for 15 credits)
- win_back: Acknowledge they cancelled, ask for feedback, mention recent improvements

Guidelines:
- Be genuine, not salesy. Reference their specific project/usage.
- Keep emails short (3-4 sentences max)
- Always include an unsubscribe note
- Use their first name if available

Return JSON: { emails: [{ userId, email, name, actionType, subject, body }] }`,
      `Targets:\n${targets.map((t) => `Type: ${t.type}\nUser: ${JSON.stringify(t.user)}`).join("\n---\n")}`,
      { maxTokens: 2000 },
    );

    tokensInput += 2500;
    tokensOutput += 1500;

    for (const email of emailDrafts.emails || []) {
      actions.push({
        type: "email_draft",
        payload: {
          userId: email.userId,
          to: email.email,
          name: email.name,
          subject: email.subject,
          body: email.body,
          actionType: email.actionType,
        },
        requiresApproval: true,
      });
    }

    return {
      success: true,
      agent: "artha_sales" as const,
      summary: `Sales: ${actions.length} emails drafted (${highEngagement.length} upgrade, ${lowCredit.length} credit alert, ${churned.length} win-back)`,
      actions,
      tokensUsed: { input: tokensInput, output: tokensOutput },
    };
  });
}
