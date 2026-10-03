import { getDb } from "@/lib/neon";

// ── Types ────────────────────────────────────────────────────────────

export type GoalType = "pageview" | "click" | "form" | "custom";

export interface GoalConfig {
  /** For pageview: the path to match (supports wildcards like /pricing*) */
  path?: string;
  /** For click: element text or id to match */
  element?: string;
  /** For form: form identifier */
  form?: string;
  /** For custom: event name */
  event_name?: string;
  /** Optional: match metadata key/value */
  metadata_key?: string;
  metadata_value?: string;
}

export interface Goal {
  id: string;
  project_id: string;
  name: string;
  type: GoalType;
  config: GoalConfig;
  created_at: string;
}

export interface GoalConversionStats {
  goal_id: string;
  total_conversions: number;
  unique_visitors: number;
  conversions_by_day: { date: string; count: number }[];
}

export interface AnalyticsEvent {
  event: string;
  path?: string;
  visitor_id?: string;
  session_id?: string;
  metadata?: Record<string, unknown>;
}

// ── Goal CRUD ────────────────────────────────────────────────────────

/**
 * Create a new analytics goal for a project.
 */
export async function createGoal(
  projectId: string,
  name: string,
  type: GoalType,
  config: GoalConfig
): Promise<Goal> {
  const db = getDb();
  const rows = await db`
    INSERT INTO analytics_goals (project_id, name, type, config)
    VALUES (${projectId}, ${name}, ${type}, ${JSON.stringify(config)}::jsonb)
    RETURNING id, project_id, name, type, config, created_at
  `;

  const row = rows[0];
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    name: row.name as string,
    type: row.type as GoalType,
    config: row.config as GoalConfig,
    created_at: String(row.created_at),
  };
}

/**
 * List all goals for a project.
 */
export async function listGoals(projectId: string): Promise<Goal[]> {
  const db = getDb();
  const rows = await db`
    SELECT id, project_id, name, type, config, created_at
    FROM analytics_goals
    WHERE project_id = ${projectId}
    ORDER BY created_at DESC
  `;

  return (rows as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    project_id: row.project_id as string,
    name: row.name as string,
    type: row.type as GoalType,
    config: row.config as GoalConfig,
    created_at: String(row.created_at),
  }));
}

/**
 * Delete a goal and its conversions.
 */
export async function deleteGoal(goalId: string): Promise<void> {
  const db = getDb();
  await db`DELETE FROM analytics_goals WHERE id = ${goalId}`;
}

// ── Goal Matching ────────────────────────────────────────────────────

/**
 * Check if an analytics event matches a goal definition.
 * If it matches, records a conversion. Returns true if converted.
 */
export async function checkGoalConversion(
  goalId: string,
  event: AnalyticsEvent
): Promise<boolean> {
  const db = getDb();

  // Fetch the goal
  const goalRows = await db`
    SELECT type, config FROM analytics_goals WHERE id = ${goalId} LIMIT 1
  `;
  if (goalRows.length === 0) return false;

  const type = goalRows[0].type as GoalType;
  const config = goalRows[0].config as GoalConfig;

  if (!matchesGoal(type, config, event)) return false;

  // Record conversion
  await db`
    INSERT INTO analytics_goal_conversions (goal_id, visitor_id, session_id)
    VALUES (
      ${goalId},
      ${event.visitor_id || "unknown"},
      ${event.session_id || null}
    )
  `;

  return true;
}

/**
 * Check all goals for a project against an event.
 * Returns array of goal IDs that matched.
 */
export async function checkAllGoals(
  projectId: string,
  event: AnalyticsEvent
): Promise<string[]> {
  const goals = await listGoals(projectId);
  const matched: string[] = [];

  for (const goal of goals) {
    if (matchesGoal(goal.type, goal.config, event)) {
      const db = getDb();
      await db`
        INSERT INTO analytics_goal_conversions (goal_id, visitor_id, session_id)
        VALUES (
          ${goal.id},
          ${event.visitor_id || "unknown"},
          ${event.session_id || null}
        )
      `;
      matched.push(goal.id);
    }
  }

  return matched;
}

// ── Goal Conversion Stats ────────────────────────────────────────────

/**
 * Get conversion statistics for a goal over a given period.
 */
export async function getGoalConversions(
  goalId: string,
  days: number = 30
): Promise<GoalConversionStats> {
  const db = getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [totals, byDay] = await Promise.all([
    db`
      SELECT
        COUNT(*) AS total_conversions,
        COUNT(DISTINCT visitor_id) AS unique_visitors
      FROM analytics_goal_conversions
      WHERE goal_id = ${goalId} AND converted_at >= ${since}
    `,
    db`
      SELECT
        DATE(converted_at) AS date,
        COUNT(*) AS count
      FROM analytics_goal_conversions
      WHERE goal_id = ${goalId} AND converted_at >= ${since}
      GROUP BY DATE(converted_at)
      ORDER BY date ASC
    `,
  ]);

  return {
    goal_id: goalId,
    total_conversions: parseInt(String(totals[0]?.total_conversions || "0"), 10),
    unique_visitors: parseInt(String(totals[0]?.unique_visitors || "0"), 10),
    conversions_by_day: (byDay as Array<{ date: string; count: string }>).map(
      (r) => ({
        date: String(r.date),
        count: parseInt(r.count, 10),
      })
    ),
  };
}

// ── Internal Helpers ─────────────────────────────────────────────────

function matchesGoal(
  type: GoalType,
  config: GoalConfig,
  event: AnalyticsEvent
): boolean {
  switch (type) {
    case "pageview": {
      if (event.event !== "pageview") return false;
      if (!config.path) return false;
      return matchPath(config.path, event.path || "/");
    }
    case "click": {
      if (event.event !== "click") return false;
      if (!config.element) return false;
      const text = String(event.metadata?.text || "").toLowerCase();
      const id = String(event.metadata?.id || "");
      const target = config.element.toLowerCase();
      return text.includes(target) || id === config.element;
    }
    case "form": {
      if (event.event !== "custom") return false;
      if (!config.form) return false;
      const formName = String(event.metadata?.form || event.metadata?.action || "");
      return formName === config.form;
    }
    case "custom": {
      if (!config.event_name) return false;
      if (event.event !== config.event_name) return false;
      // Optional metadata match
      if (config.metadata_key && config.metadata_value) {
        const val = String(event.metadata?.[config.metadata_key] || "");
        return val === config.metadata_value;
      }
      return true;
    }
  }
}

/**
 * Simple path matching with wildcard support.
 * /pricing* matches /pricing, /pricing/pro, etc.
 */
function matchPath(pattern: string, path: string): boolean {
  if (pattern === path) return true;
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    return path.startsWith(prefix);
  }
  return false;
}
