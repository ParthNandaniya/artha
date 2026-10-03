import type { AgentName, TaskTag } from "@/lib/types";
import type { ExecutionScratchpad } from "./framework/scratchpad";

export type { AgentName, TaskTag };

export interface AgentInput {
  prompt: string;
  context: string;
  projectId: string;
  userId: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
  onProgress?: (message: string) => void;
  /** Stream raw token output to the client (e.g. for live website generation preview) */
  onToken?: (chunk: string) => void;
  /** Shared working memory for the current orchestration run */
  scratchpad?: ExecutionScratchpad;
}

export interface AgentOutput {
  success: boolean;
  agent: AgentName;
  summary: string;
  documents?: { type: string; title: string; content: string; metadata?: Record<string, unknown> }[];
  memoryUpdates?: { key: string; value: unknown }[];
  supermemoryIngestions?: { content: string; customId: string; dedupeKey?: string; metadata?: Record<string, unknown> }[];
  tasksCreated?: { title: string; description: string; type: string; tag: string; agent: string; revenue_impact?: string }[];
  emails?: { to: string; subject: string; html: string; needsConfirmation?: boolean }[];
  tweets?: { content: string; threadId?: string }[];
  pages?: { slug: string; title: string; html: string }[];
  links?: { label: string; url: string }[];
  schemaOperations?: { operation: string; table: string; columns?: unknown[]; seedData?: unknown[]; indexes?: unknown[] }[];
  videos?: { type: string; title: string; description: string; platform: string; url?: string; thumbnail_url?: string; captions?: Record<string, string> }[];
  socialPosts?: { platform: string; content: string; media_url?: string; scheduled_at?: string; hashtags?: string[] }[];
  outreachSequences?: { lead_name: string; lead_email: string; lead_company: string; steps: { step_number: number; subject: string; body_html: string; delay_days: number }[] }[];
  leads?: {
    name: string;
    email?: string;
    linkedin_url?: string;
    company: string;
    role?: string;
    phone?: string;
    website?: string;
    source?: string;
    score: number;
    notes?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }[];
  error?: string;
}

export type IntentType =
  | "send_email"
  | "build_website"
  | "research"
  | "find_leads"
  | "tweet"
  | "plan_tasks"
  | "update_document"
  | "manage_database"
  | "setup_payments"
  | "generate_video"
  | "social_media"
  | "sales_outreach"
  | "general"
  | "multi";

export interface SubtaskCondition {
  type: "output_contains" | "output_field_exists" | "custom";
  sourceSubtaskId: string;
  field?: string;
  value?: unknown;
  /** Simple expression evaluated against output (for "custom" type) */
  expression?: string;
}

export interface AgentSubtask {
  id: string;
  agent: AgentName;
  prompt: string;
  description: string;
  dependsOn: string[];
  /** Optional condition — if false, subtask is skipped */
  condition?: SubtaskCondition;
}

export interface DecomposedIntent {
  type: IntentType;
  subtasks: AgentSubtask[];
  directAnswer?: string;
}

export type SubtaskStatus = "pending" | "running" | "completed" | "failed" | "skipped" | "cancelled";

export interface SubtaskBreakdownItem {
  id: string;
  agent: AgentName;
  description: string;
  status: SubtaskStatus;
  summary?: string;
  links?: { label: string; url: string }[];
  error?: string;
}

export interface SSEEvent {
  event:
    | "plan"
    | "thinking"
    | "agent_start"
    | "agent_done"
    | "task_created"
    | "leads_created"
    | "credits_exhausted"
    | "done"
    | "tasks_breakdown"
    | "subtask_status"
    | "subtask_thinking"
    | "plan_preview"
    | "tool_use"
    | "replan"
    | "validation"
    | "direct_answer_stream"
    | "agent_stream";
  data: Record<string, unknown>;
}

export interface MultiAgentPlan {
  agents: AgentName[];
  subtasks: AgentSubtask[];
  executionLayers: string[][];
  creditsRequired: number;
  creditsAvailable: number;
  willExecute: string[];
  deferred: string[];
}

export interface AgentDoneResult {
  subtaskId: string;
  agent: AgentName;
  agentIndex: number;
  summary: string;
  links: { label: string; url: string }[];
  creditsRemaining: number;
}

export interface ExecutionSummary {
  message: string;
  completed: AgentDoneResult[];
  deferred: { agent: AgentName; reason: string }[];
  failedCount: number;
  creditsUsed: number;
  creditsRemaining: number;
  showCreditPrompt: boolean;
}
