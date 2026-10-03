import type { CreditLedgerApi, EmitFn } from "./types";

const TOKEN_COST_PER_1K_INPUT = 0.003;
const TOKEN_COST_PER_1K_OUTPUT = 0.012;
const SUBAGENT_DISCOUNT = 0.8;

const OPERATION_COSTS: Record<string, number> = {
  web_search_neural: 0.1,
  web_search_keyword: 0.05,
  web_fetch: 0.05,
  find_similar: 0.08,
  memory_write: 0.02,
  memory_search: 0.02,
  send_email: 0.1,
  schedule_email: 0.1,
  publish_site: 0.1,
  post_tweet: 0.2,
  schedule_tweet: 0.2,
  execute_sql: 0.05,
  schedule_task: 0.03,
  save_lead: 0.02,
};

export interface CreditLedgerOptions {
  available: number;
  freeWebsiteBuildAvailable?: boolean;
  emit?: EmitFn;
  maxPerTurn?: number;
}

const FREE_BUILD_BUDGET = 5;

export class CreditLedger implements CreditLedgerApi {
  private _used = 0;
  private readonly available: number;
  private readonly realAvailable: number;
  private readonly emit?: EmitFn;
  private readonly maxPerTurn: number;
  private readonly freeWebsiteBuildAvailable: boolean;

  constructor(opts: CreditLedgerOptions) {
    this.realAvailable = Math.max(0, opts.available);
    this.freeWebsiteBuildAvailable = Boolean(opts.freeWebsiteBuildAvailable);
    // If this is a free first-build, let the agent spend up to FREE_BUILD_BUDGET
    // credits-worth of work even when the user has 0 real credits. The route
    // only charges min(used, realAvailable), so the user isn't billed.
    this.available = this.freeWebsiteBuildAvailable && this.realAvailable < FREE_BUILD_BUDGET
      ? FREE_BUILD_BUDGET
      : this.realAvailable;
    this.emit = opts.emit;
    this.maxPerTurn = opts.maxPerTurn ?? 10;
  }

  charge(kind: string, amount: number): void {
    if (amount <= 0) return;
    this._used += amount;
    this.emit?.({
      event: "tool_use",
      data: { kind, credits: amount, used: this._used, remaining: Math.max(this.available - this._used, 0) },
    });
  }

  chargeTokens(inputTokens: number, outputTokens: number, subagent = false): void {
    const raw = (inputTokens / 1000) * TOKEN_COST_PER_1K_INPUT + (outputTokens / 1000) * TOKEN_COST_PER_1K_OUTPUT;
    const scaled = subagent ? raw * SUBAGENT_DISCOUNT : raw;
    this.charge(subagent ? "llm_subagent" : "llm_main", scaled);
  }

  chargeOperation(opName: string): void {
    const cost = OPERATION_COSTS[opName] ?? 0;
    this.charge(opName, cost);
  }

  remaining(): number {
    return Math.max(this.available - this._used, 0);
  }

  used(): number {
    return this._used;
  }

  exhausted(): boolean {
    // "exhausted" means we've spent more than the effective budget. Strict `>`
    // so a fresh ledger (used=0, available=0 for truly-broke non-free runs)
    // still returns true BEFORE any charge — that's the "can't even start" case.
    // After any charge, we cap by both the available budget and the per-turn cap.
    if (this.available === 0) return true;
    return this._used >= this.available || this._used >= this.maxPerTurn;
  }

  /** True if this run had zero real credits AND no free-build grant. */
  startedBroke(): boolean {
    return this.realAvailable === 0 && !this.freeWebsiteBuildAvailable;
  }

  realCreditsAvailable(): number {
    return this.realAvailable;
  }

  snapshot() {
    return { used: this._used, remaining: this.remaining() };
  }
}

export function getOperationCost(opName: string): number {
  return OPERATION_COSTS[opName] ?? 0;
}
