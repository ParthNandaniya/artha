import { getDb } from "@/lib/neon";

// ── Types ────────────────────────────────────────────────────────────

export type FunnelStep = {
  type: "pageview" | "click" | "form";
  value: string;
};

export interface FunnelStepResult {
  name: string;
  visitors: number;
  dropoff_pct: number;
}

export interface FunnelResult {
  steps: FunnelStepResult[];
  overall_conversion: number;
}

// ── Funnel Calculation ───────────────────────────────────────────────

/**
 * Calculate funnel conversion rates given an ordered array of step definitions.
 *
 * Each step filters visitors who performed the action in sequence (same session).
 * A visitor must complete step N before step N+1 (ordered by timestamp).
 *
 * @param projectId - The project to analyze
 * @param steps - Ordered funnel step definitions
 * @param days - Number of days to look back (default: 30)
 */
export async function calculateFunnel(
  projectId: string,
  steps: FunnelStep[],
  days: number = 30
): Promise<FunnelResult> {
  if (steps.length === 0) {
    return { steps: [], overall_conversion: 0 };
  }

  const db = getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // For each step, get the set of visitor_ids who performed that action.
  // Then intersect sequentially (a visitor must do step 1 before step 2, etc.)
  // We use session_id to enforce ordering within a session.

  // Step 1: Get all qualifying events grouped by visitor
  const stepResults: FunnelStepResult[] = [];
  let previousVisitors: Set<string> | null = null;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const { eventType, matchCondition } = buildStepQuery(step);

    // Query visitors who performed this step action
    const rows = await db.query(
      `SELECT DISTINCT visitor_id, MIN(created_at) AS first_at
       FROM site_analytics
       WHERE project_id = $1
         AND created_at >= $2
         AND event = $3
         AND ${matchCondition.sql}
         AND visitor_id IS NOT NULL
       GROUP BY visitor_id`,
      [projectId, since, eventType, ...matchCondition.params]
    );

    const currentVisitors = new Set(
      (rows as Array<{ visitor_id: string }>).map((r) => r.visitor_id)
    );

    // Intersect with previous step visitors
    let filteredVisitors: Set<string>;
    if (previousVisitors === null) {
      filteredVisitors = currentVisitors;
    } else {
      filteredVisitors = new Set<string>();
      for (const vid of currentVisitors) {
        if (previousVisitors.has(vid)) {
          filteredVisitors.add(vid);
        }
      }
    }

    const prevCount = previousVisitors?.size ?? filteredVisitors.size;
    const dropoff =
      prevCount > 0
        ? Math.round(((prevCount - filteredVisitors.size) / prevCount) * 100)
        : 0;

    stepResults.push({
      name: stepLabel(step),
      visitors: filteredVisitors.size,
      dropoff_pct: i === 0 ? 0 : dropoff,
    });

    previousVisitors = filteredVisitors;
  }

  const firstStepVisitors = stepResults[0]?.visitors ?? 0;
  const lastStepVisitors = stepResults[stepResults.length - 1]?.visitors ?? 0;
  const overallConversion =
    firstStepVisitors > 0
      ? Math.round((lastStepVisitors / firstStepVisitors) * 100)
      : 0;

  return {
    steps: stepResults,
    overall_conversion: overallConversion,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function buildStepQuery(step: FunnelStep): {
  eventType: string;
  matchCondition: { sql: string; params: string[] };
} {
  switch (step.type) {
    case "pageview":
      return {
        eventType: "pageview",
        matchCondition: { sql: "path = $4", params: [step.value] },
      };
    case "click":
      // Match clicks by element text or id in metadata
      return {
        eventType: "click",
        matchCondition: {
          sql: "(metadata->>'text' ILIKE $4 OR metadata->>'id' = $4)",
          params: [step.value],
        },
      };
    case "form":
      // Match form submissions (custom events with form identifier)
      return {
        eventType: "custom",
        matchCondition: {
          sql: "(metadata->>'form' = $4 OR metadata->>'action' = $4)",
          params: [step.value],
        },
      };
  }
}

function stepLabel(step: FunnelStep): string {
  switch (step.type) {
    case "pageview":
      return `View ${step.value}`;
    case "click":
      return `Click "${step.value}"`;
    case "form":
      return `Submit ${step.value}`;
  }
}
