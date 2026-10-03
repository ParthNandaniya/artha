import { getDb } from "@/lib/neon";
import type { ArthaOpsAgentName, ArthaOpsTrigger } from "@/lib/types";
import type { OpsAgentResult, OpsAction } from "./types";
import { ARTHA_OPS_AGENT_CONFIGS } from "./types";

/**
 * Check if ops agents are globally enabled.
 */
function isOpsEnabled(): boolean {
  return process.env.ARTHA_OPS_ENABLED !== "false";
}

/**
 * Check daily budget for an agent. Returns true if within budget.
 */
async function checkBudget(agent: ArthaOpsAgentName): Promise<boolean> {
  const db = getDb();
  const config = ARTHA_OPS_AGENT_CONFIGS[agent];

  const rows = await db`
    SELECT runs_count, cost_usd
    FROM artha_ops_budgets
    WHERE agent_name = ${agent} AND date = CURRENT_DATE
  `;

  if (rows.length === 0) return true;

  const { runs_count, cost_usd } = rows[0] as { runs_count: number; cost_usd: number };
  return runs_count < config.maxRunsPerDay && cost_usd < config.dailyBudgetUsd;
}

/**
 * Create a run record and return its ID.
 */
async function createRun(
  agent: ArthaOpsAgentName,
  trigger: ArthaOpsTrigger,
  input: Record<string, unknown> | null,
): Promise<string> {
  const db = getDb();
  const rows = await db`
    INSERT INTO artha_ops_runs (agent_name, trigger, status, input)
    VALUES (${agent}, ${trigger}, 'running', ${JSON.stringify(input)}::jsonb)
    RETURNING id
  `;
  return rows[0].id as string;
}

/**
 * Complete a run record with results.
 */
async function completeRun(
  runId: string,
  result: OpsAgentResult,
): Promise<void> {
  const db = getDb();
  const costUsd = estimateCost(result.tokensUsed.input, result.tokensUsed.output);

  await db`
    UPDATE artha_ops_runs
    SET status = ${result.success ? "completed" : "failed"},
        output = ${JSON.stringify({ summary: result.summary, actions: result.actions })}::jsonb,
        actions_taken = ${JSON.stringify(result.actions)}::jsonb,
        tokens_used = ${result.tokensUsed.input + result.tokensUsed.output},
        cost_usd = ${costUsd},
        duration_ms = ${0},
        error = ${result.error || null},
        completed_at = NOW()
    WHERE id = ${runId}
  `;

  // Update daily budget
  await db`
    INSERT INTO artha_ops_budgets (agent_name, date, tokens_used, cost_usd, runs_count)
    VALUES (${result.agent}, CURRENT_DATE, ${result.tokensUsed.input + result.tokensUsed.output}, ${costUsd}, 1)
    ON CONFLICT (agent_name, date)
    DO UPDATE SET
      tokens_used = artha_ops_budgets.tokens_used + EXCLUDED.tokens_used,
      cost_usd = artha_ops_budgets.cost_usd + EXCLUDED.cost_usd,
      runs_count = artha_ops_budgets.runs_count + 1
  `;
}

/**
 * Queue actions that require human approval.
 */
async function queueApprovals(
  runId: string,
  agent: ArthaOpsAgentName,
  actions: OpsAction[],
): Promise<void> {
  const db = getDb();
  const needsApproval = actions.filter((a) => a.requiresApproval);

  for (const action of needsApproval) {
    await db`
      INSERT INTO artha_ops_approvals (run_id, agent_name, action_type, payload)
      VALUES (${runId}, ${agent}, ${action.type}, ${JSON.stringify(action.payload)}::jsonb)
    `;
  }
}

/**
 * Estimate cost in USD for Sonnet 4.6 with prompt caching + batch API.
 * Cached+batch: $0.15/1M input, $7.50/1M output
 */
function estimateCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * 0.15 + outputTokens * 7.5) / 1_000_000;
}

/**
 * Main entry point: run an ops agent with full audit trail, budget checks, and approval handling.
 */
export async function runOpsAgent(
  agent: ArthaOpsAgentName,
  trigger: ArthaOpsTrigger,
  input: Record<string, unknown> | null,
  executeFn: (runId: string) => Promise<OpsAgentResult>,
): Promise<{ runId: string; result: OpsAgentResult; skipped: boolean }> {
  // Kill switch
  if (!isOpsEnabled()) {
    return {
      runId: "",
      result: {
        success: false,
        agent,
        summary: "Ops agents disabled",
        actions: [],
        tokensUsed: { input: 0, output: 0 },
        error: "ARTHA_OPS_ENABLED=false",
      },
      skipped: true,
    };
  }

  // Budget check
  const withinBudget = await checkBudget(agent);
  if (!withinBudget) {
    return {
      runId: "",
      result: {
        success: false,
        agent,
        summary: "Daily budget exceeded",
        actions: [],
        tokensUsed: { input: 0, output: 0 },
        error: "Budget limit reached for today",
      },
      skipped: true,
    };
  }

  // Create audit record
  const runId = await createRun(agent, trigger, input);
  const startTime = Date.now();

  try {
    const result = await executeFn(runId);

    // Update duration
    result.tokensUsed = result.tokensUsed || { input: 0, output: 0 };

    // Complete the run
    await completeRun(runId, result);

    // Handle approvals
    const config = ARTHA_OPS_AGENT_CONFIGS[agent];
    if (config.approvalRequired) {
      // Mark all actions as requiring approval
      const actionsWithApproval = result.actions.map((a) => ({
        ...a,
        requiresApproval: true,
      }));
      await queueApprovals(runId, agent, actionsWithApproval);
    } else {
      // Queue only actions that explicitly need approval
      await queueApprovals(runId, agent, result.actions);
    }

    // Update duration in run record
    const durationMs = Date.now() - startTime;
    const db = getDb();
    await db`UPDATE artha_ops_runs SET duration_ms = ${durationMs} WHERE id = ${runId}`;

    return { runId, result, skipped: false };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startTime;

    await completeRun(runId, {
      success: false,
      agent,
      summary: `Agent failed: ${errorMsg}`,
      actions: [],
      tokensUsed: { input: 0, output: 0 },
      error: errorMsg,
    });

    const db = getDb();
    await db`UPDATE artha_ops_runs SET duration_ms = ${durationMs} WHERE id = ${runId}`;

    return {
      runId,
      result: {
        success: false,
        agent,
        summary: `Agent failed: ${errorMsg}`,
        actions: [],
        tokensUsed: { input: 0, output: 0 },
        error: errorMsg,
      },
      skipped: false,
    };
  }
}
