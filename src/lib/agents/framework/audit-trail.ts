import type { AgentName } from "@/lib/types";

export interface AuditEntry {
  timestamp: string;
  type:
    | "thinking"
    | "tool_call"
    | "tool_result"
    | "llm_response"
    | "validation"
    | "retry"
    | "quality_judge"
    | "replan"
    | "sub_agent_start"
    | "sub_agent_done"
    | "error";
  agent: AgentName;
  subtaskId?: string;
  data: {
    toolName?: string;
    toolInput?: unknown;
    toolOutput?: string;
    thinkingContent?: string;
    validationResult?: { pass: boolean; feedback: string; scores?: Record<string, number> };
    llmModel?: string;
    tokenUsage?: { input: number; output: number; thinking?: number };
    durationMs?: number;
    message?: string;
    subAgent?: AgentName;
    error?: string;
  };
}

export class AuditTrail {
  private entries: AuditEntry[] = [];
  private totalInput = 0;
  private totalOutput = 0;
  private totalThinking = 0;

  log(entry: Omit<AuditEntry, "timestamp">): void {
    this.entries.push({ ...entry, timestamp: new Date().toISOString() });
    if (entry.data.tokenUsage) {
      this.totalInput += entry.data.tokenUsage.input;
      this.totalOutput += entry.data.tokenUsage.output;
      this.totalThinking += entry.data.tokenUsage.thinking ?? 0;
    }
  }

  getEntries(): AuditEntry[] {
    return this.entries;
  }

  getTotalTokenUsage(): { input: number; output: number; thinking: number } {
    return { input: this.totalInput, output: this.totalOutput, thinking: this.totalThinking };
  }

  getTotalDuration(): number {
    if (this.entries.length === 0) return 0;
    const first = new Date(this.entries[0].timestamp).getTime();
    const last = new Date(this.entries[this.entries.length - 1].timestamp).getTime();
    return last - first;
  }

  toJSON(): string {
    return JSON.stringify({
      entries: this.entries,
      summary: {
        totalEntries: this.entries.length,
        tokenUsage: this.getTotalTokenUsage(),
        durationMs: this.getTotalDuration(),
        toolCalls: this.entries.filter((e) => e.type === "tool_call").length,
        retries: this.entries.filter((e) => e.type === "retry").length,
        subAgents: this.entries.filter((e) => e.type === "sub_agent_start").length,
      },
    });
  }

  /** Merge another audit trail (from sub-agent) into this one as nested entries */
  merge(childTrail: AuditTrail): void {
    for (const entry of childTrail.getEntries()) {
      this.entries.push(entry);
    }
    const childTokens = childTrail.getTotalTokenUsage();
    this.totalInput += childTokens.input;
    this.totalOutput += childTokens.output;
    this.totalThinking += childTokens.thinking;
  }
}
