import type { SSEEvent } from "../types";

export type ToolCallId = string;

export type TodoStatus = "pending" | "in_progress" | "completed";
export interface Todo {
  content: string;
  activeForm: string;
  status: TodoStatus;
}

export type EmitFn = (event: SSEEvent) => void;

export interface RuntimeSession {
  sessionId: string;
  runId: string;
  projectId: string;
  userId: string;
  projectSlug?: string;
  projectName?: string;
  companyContext: string;
  activePanel?: string;
  emit: EmitFn;
  signal?: AbortSignal;
  todos: Todo[];
  preAuthorized: Set<string>;
  depth: number;
}

export interface WorkspaceEntry {
  path: string;
  original: string | null;
  current: string;
  dirty: boolean;
  deleted: boolean;
  loadedAt: number;
}

export interface PathReadResult {
  content: string;
  readonly?: boolean;
}

export type ResourceKind =
  | "site"
  | "docs"
  | "tasks"
  | "emails"
  | "leads"
  | "analytics"
  | "memory"
  | "contacts";

export interface ToolResult {
  content: string;
  isError?: boolean;
}

export interface RuntimeToolContext {
  session: RuntimeSession;
  workspace: WorkspaceApi;
  credits: CreditLedgerApi;
}

export interface WorkspaceApi {
  read(path: string, opts?: { offset?: number; limit?: number }): Promise<string>;
  list(pattern: string): Promise<string[]>;
  edit(path: string, oldString: string, newString: string, replaceAll?: boolean): Promise<void>;
  write(path: string, content: string): Promise<void>;
  grep(
    pattern: string,
    opts?: { path?: string; context?: number; outputMode?: "content" | "files_with_matches" | "count"; headLimit?: number },
  ): Promise<string>;
  diffSummary(): Array<{ path: string; changeType: "modified" | "created" | "deleted"; bytes: number }>;
  commit(): Promise<{ committed: string[]; errors: Array<{ path: string; error: string }> }>;
  rollback(): void;
}

export interface CreditLedgerApi {
  charge(kind: string, amount: number): void;
  chargeTokens(inputTokens: number, outputTokens: number, subagent?: boolean): void;
  chargeOperation(opName: string): void;
  remaining(): number;
  used(): number;
  exhausted(): boolean;
  snapshot(): { used: number; remaining: number };
}

export interface RuntimeToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  /** If true, the harness pauses for user approval before executing. */
  requiresPermission?: boolean;
  /** If true, this tool is purely informational; don't charge credits. */
  readOnly?: boolean;
  execute: (input: Record<string, unknown>, ctx: RuntimeToolContext) => Promise<ToolResult>;
}

export interface RunArthaAgentInput {
  projectId: string;
  userId: string;
  message: string;
  chatHistory: string;
  context: string;
  creditsAvailable: number;
  freeWebsiteBuildAvailable: boolean;
  metadata: {
    slug?: string;
    companyName?: string;
    repoFullName?: string;
    activePanel?: string;
  };
  emit: EmitFn;
  signal?: AbortSignal;
}

export interface RunArthaAgentResult {
  finalText: string;
  todos: Todo[];
  committed: Array<{ path: string; changeType: "modified" | "created" | "deleted" }>;
  creditsUsed: number;
  creditsRemaining: number;
  toolCalls: number;
  iterations: number;
  stopReason: "completed" | "max_iterations" | "credits_exhausted" | "aborted" | "error";
  error?: string;
  /** True if OpenAI failed mid-turn and the loop fell back to Anthropic. */
  fallbackUsed?: boolean;
}
