import { getDb } from "@/lib/neon";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { runOpsAgent } from "./runner";
import type { OpsAgentResult, OpsAction } from "./types";

interface TriageResult {
  tickets: {
    ticketId: string;
    subject: string;
    response: string;
    confidence: number;
    shouldEscalate: boolean;
    category: string;
  }[];
  summary: string;
  newUsersFollowedUp: number;
  churnSignals: { userId: string; reason: string }[];
}

async function getOpenTickets() {
  const db = getDb();
  return db`
    SELECT st.*, u.email, u.name
    FROM support_tickets st
    LEFT JOIN users u ON u.id = st.user_id
    WHERE st.status = 'open'
    ORDER BY st.created_at ASC
    LIMIT 20
  `;
}

async function getNewUsersNeedingFollowUp() {
  const db = getDb();
  return db`
    SELECT u.id, u.email, u.name, p.name AS project_name, p.slug, p.status AS project_status
    FROM users u
    JOIN projects p ON p.user_id = u.id
    WHERE u.created_at >= NOW() - INTERVAL '48 hours'
      AND u.created_at < NOW() - INTERVAL '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM support_tickets st
        WHERE st.user_id = u.id AND st.subject LIKE '%welcome%'
      )
    LIMIT 10
  `;
}

async function getDormantUsers() {
  const db = getDb();
  return db`
    SELECT u.id, u.email, u.name, p.name AS project_name,
           MAX(t.completed_at) AS last_task_at
    FROM users u
    JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks t ON t.project_id = p.id AND t.status = 'completed'
    WHERE p.subscription_status = 'active'
    GROUP BY u.id, u.email, u.name, p.name
    HAVING MAX(t.completed_at) < NOW() - INTERVAL '7 days'
       OR MAX(t.completed_at) IS NULL
    LIMIT 10
  `;
}

export async function runSupportAgent(trigger: "cron" | "webhook" | "manual" = "cron") {
  return runOpsAgent("artha_support", trigger, null, async () => {
    const tickets = await getOpenTickets();
    const newUsers = await getNewUsersNeedingFollowUp();
    const dormantUsers = await getDormantUsers();
    const actions: OpsAction[] = [];

    let tokensInput = 0;
    let tokensOutput = 0;

    // Skip if nothing to process
    if (tickets.length === 0 && newUsers.length === 0 && dormantUsers.length === 0) {
      return {
        success: true,
        agent: "artha_support" as const,
        summary: "No open tickets, new users, or dormant users to process",
        actions: [],
        tokensUsed: { input: 0, output: 0 },
      };
    }

    // Triage open tickets
    if (tickets.length > 0) {
      const triage = await generateAgentJSON<{
        responses: { ticketId: string; response: string; confidence: number; shouldEscalate: boolean; category: string }[];
      }>(
        "artha_support",
        `You are a customer support agent for Artha, an AI company builder SaaS ($49/mo, 35 credits/month).
Users can build AI-powered companies through Artha's dashboard.

For each support ticket, provide:
- A helpful, friendly response
- Your confidence level (0-1) in the response being correct and sufficient
- Whether to escalate to a human (billing issues, refund requests, or if confidence < 0.6)
- Category: "technical", "billing", "feature_request", "bug_report", "onboarding", "general"

Be concise but warm. Address the user by name if available.
Return JSON: { responses: [{ ticketId, response, confidence, shouldEscalate, category }] }`,
        `Open tickets:\n${tickets.map((t: Record<string, unknown>) => `ID: ${t.id}\nFrom: ${t.name || t.email || "Unknown"}\nSubject: ${t.subject}\nMessages: ${JSON.stringify(t.messages)}`).join("\n---\n")}`,
        { maxTokens: 2000 },
      );

      tokensInput += 2000;
      tokensOutput += 1000;

      const db = getDb();
      for (const resp of triage.responses || []) {
        if (resp.shouldEscalate || resp.confidence < 0.6) {
          await db`
            UPDATE support_tickets SET status = 'escalated', escalated_at = NOW(), agent_confidence = ${resp.confidence}
            WHERE id = ${resp.ticketId}
          `;
          actions.push({
            type: "escalation",
            payload: { ticketId: resp.ticketId, category: resp.category, confidence: resp.confidence },
            requiresApproval: false,
          });
        } else {
          // Queue auto-response for approval
          actions.push({
            type: "email_draft",
            payload: { ticketId: resp.ticketId, response: resp.response, confidence: resp.confidence, category: resp.category },
            requiresApproval: true,
          });
          await db`
            UPDATE support_tickets
            SET status = 'auto_resolved', agent_confidence = ${resp.confidence}, resolved_at = NOW(),
                messages = messages || ${JSON.stringify([{ role: "agent", content: resp.response, at: new Date().toISOString() }])}::jsonb
            WHERE id = ${resp.ticketId}
          `;
        }
      }
    }

    // Follow up with new users (24-48h after signup)
    for (const user of newUsers) {
      actions.push({
        type: "email_draft",
        payload: {
          to: user.email,
          subject: `How's ${user.project_name || "your project"} going?`,
          context: "new_user_followup",
          userName: user.name,
          projectName: user.project_name,
        },
        requiresApproval: true,
      });
    }

    // Flag churn signals
    const churnSignals: { userId: string; reason: string }[] = [];
    for (const user of dormantUsers) {
      churnSignals.push({
        userId: user.id as string,
        reason: `Subscribed but inactive for 7+ days (last task: ${user.last_task_at || "never"})`,
      });
    }

    if (churnSignals.length > 0) {
      actions.push({
        type: "alert",
        payload: { type: "churn_signals", signals: churnSignals },
        requiresApproval: false,
      });
    }

    return {
      success: true,
      agent: "artha_support" as const,
      summary: `Support: ${tickets.length} tickets triaged, ${newUsers.length} follow-ups, ${churnSignals.length} churn signals`,
      actions,
      tokensUsed: { input: tokensInput, output: tokensOutput },
    };
  });
}
