import { getDb } from "@/lib/neon";

export type AgentType =
  | "orchestrator"
  | "task_runner"
  | "twitter_bot"
  | "email_agent"
  | "content_poster"
  | "research_agent"
  | "lead_finder";

export type ActivityAction =
  | "decided"
  | "executed"
  | "skipped"
  | "failed"
  | "completed";

export async function logAgentActivity(params: {
  projectId: string;
  agentType: AgentType;
  action: ActivityAction;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
}) {
  const db = getDb();
  await db`
    INSERT INTO agent_activity (project_id, agent_type, action, title, description, metadata)
    VALUES (
      ${params.projectId},
      ${params.agentType},
      ${params.action},
      ${params.title},
      ${params.description || null},
      ${params.metadata ? JSON.stringify(params.metadata) : "{}"}::jsonb
    )
  `;
}

export async function getRecentActivity(projectId: string, limit = 50) {
  const db = getDb();
  return db`
    SELECT * FROM agent_activity
    WHERE project_id = ${projectId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

export async function getRecentActivityAllProjects(limit = 100) {
  const db = getDb();
  return db`
    SELECT aa.*, p.name as project_name, p.slug as project_slug
    FROM agent_activity aa
    JOIN projects p ON p.id = aa.project_id
    ORDER BY aa.created_at DESC
    LIMIT ${limit}
  `;
}
