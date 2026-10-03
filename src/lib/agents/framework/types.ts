import type { AgentName } from "@/lib/types";
import type { AgentInput, AgentOutput } from "../types";
import type { AuditTrail } from "./audit-trail";
import type { ExecutionScratchpad } from "./scratchpad";

// ── Tool System ─────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolExecutionContext {
  projectId: string;
  userId: string;
  scratchpad?: ExecutionScratchpad;
  auditTrail: AuditTrail;
  onProgress?: (message: string) => void;
  /** Current depth for sub-agent spawning (0 = top-level, 1 = sub-agent) */
  depth: number;
  /** Credit budget remaining for this execution */
  creditsRemaining?: number;
}

export type ToolExecutor = (
  input: Record<string, unknown>,
  context: ToolExecutionContext,
) => Promise<string>;

export interface RegisteredTool {
  definition: ToolDefinition;
  execute: ToolExecutor;
}

// ── Validation ──────────────────────────────────────────────────────

export interface StructuralValidation {
  /** JSON schema to validate the parsed output against */
  jsonSchema?: Record<string, unknown>;
  /** Fields that must be present and non-empty in the output */
  requiredFields?: string[];
  /** Run HTML validation on the output */
  htmlValidation?: boolean;
  /** Per-field max character count */
  maxLength?: Record<string, number>;
}

export interface QualityValidation {
  enabled: boolean;
  /** Model to use for quality judging (default: Claude Sonnet) */
  model?: string;
  /** Minimum average score to pass (1-5 scale) */
  threshold: number;
  /** Per-dimension weights */
  weights?: {
    completeness: number;
    accuracy: number;
    actionability: number;
    formatting: number;
  };
}

export interface ValidationCriteria {
  structural?: StructuralValidation;
  quality?: QualityValidation;
}

export interface ValidationResult {
  passed: boolean;
  structuralErrors?: string[];
  qualityScores?: {
    completeness: number;
    accuracy: number;
    actionability: number;
    formatting: number;
    average: number;
  };
  feedback?: string;
}

// ── Agentic Configuration ───────────────────────────────────────────

export interface AgenticConfig {
  agent: AgentName;
  /** Max tool-use loop iterations (1 = no loop, just single call with tools) */
  maxIterations: number;
  /** Which tools this agent can use */
  tools: string[];
  /** Enable Anthropic extended thinking */
  useExtendedThinking: boolean;
  /** Max thinking tokens budget */
  thinkingBudget?: number;
  /** Output validation criteria */
  validationCriteria?: ValidationCriteria;
  /** Max retry attempts after validation failure */
  maxRetries: number;
  /** Max sub-agents this agent can spawn (0 = disabled) */
  maxSubAgents: number;
  /** Timeout for entire agent execution in ms */
  timeoutMs?: number;
  /** Max chars per tool result before truncation (default: 8000) */
  maxToolResultChars?: number;
  /** Enable mid-loop reflection + self-critique before finalizing */
  reflectionEnabled?: boolean;
  /** Max estimated tokens for context window management (default: 80_000) */
  maxEstimatedTokens?: number;
}

/** Partial overrides that can be applied at runtime */
export type AgenticOverrides = Partial<
  Pick<
    AgenticConfig,
    | "maxIterations"
    | "thinkingBudget"
    | "maxRetries"
    | "maxSubAgents"
    | "useExtendedThinking"
    | "timeoutMs"
  > & { qualityThreshold?: number }
>;

// ── Runner Types ────────────────────────────────────────────────────

export interface AgenticRunnerInput {
  /** System prompt for the agent */
  systemPrompt: string;
  /** User prompt / task description */
  userPrompt: string;
  /** Pre-built context string (company memory, chat history, etc.) */
  context: string;
  /** Standard agent input fields */
  agentInput: AgentInput;
  /** Agentic configuration for this run */
  config: AgenticConfig;
  /** Runtime overrides (e.g., pipeline tier) */
  overrides?: AgenticOverrides;
  /** Model to use (overrides agent-models.ts default) */
  model?: string;
  /** Provider for this run */
  provider?: "anthropic" | "openai";
}

export interface AgenticRunnerOutput {
  /** The agent's parsed output */
  result: AgentOutput;
  /** Full audit trail of this execution */
  auditTrail: AuditTrail;
  /** Total token usage */
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
  };
  /** Number of tool-use iterations performed */
  iterations: number;
  /** Number of validation retries performed */
  retries: number;
  /** Whether the output passed validation */
  validationPassed: boolean;
  /** Duration in ms */
  durationMs: number;
}
