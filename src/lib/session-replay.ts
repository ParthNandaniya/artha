import { getDb } from "@/lib/neon";

// ── Types ────────────────────────────────────────────────────────────

export interface ReplaySession {
  id: string;
  visitor_id: string;
  session_id: string;
  duration_ms: number | null;
  pages: string[];
  events_count: number;
  device: string | null;
  started_at: string;
  created_at: string;
}

export interface ReplayEvent {
  t: "snapshot" | "mouse" | "click" | "scroll" | "input";
  ts: number;
  s: number;
  d: Record<string, unknown>;
  n?: number; // RLE count for compressed mouse events
}

export interface ReplayData {
  id: string;
  visitor_id: string;
  session_id: string;
  duration_ms: number | null;
  pages: string[];
  device: string | null;
  started_at: string;
  events: ReplayEvent[];
}

export interface ReplayStats {
  total_sessions: number;
  avg_duration_ms: number;
  total_events: number;
  top_pages: { page: string; count: number }[];
  device_breakdown: { device: string; count: number }[];
}

export interface ReplayListOptions {
  dateFrom?: string;
  dateTo?: string;
  page?: string;
  device?: string;
  limit?: number;
  offset?: number;
}

// ── Query Functions ──────────────────────────────────────────────────

/**
 * List replay sessions for a project with optional filters.
 */
export async function getReplaySessions(
  projectId: string,
  options: ReplayListOptions = {}
): Promise<{ sessions: ReplaySession[]; total: number }> {
  const db = getDb();
  const limit = Math.min(options.limit ?? 50, 100);
  const offset = options.offset ?? 0;

  // Build conditions dynamically
  const conditions: string[] = ["project_id = $1"];
  const values: unknown[] = [projectId];
  let paramIdx = 2;

  if (options.dateFrom) {
    conditions.push(`started_at >= $${paramIdx}`);
    values.push(options.dateFrom);
    paramIdx++;
  }
  if (options.dateTo) {
    conditions.push(`started_at <= $${paramIdx}`);
    values.push(options.dateTo);
    paramIdx++;
  }
  if (options.page) {
    conditions.push(`$${paramIdx} = ANY(pages)`);
    values.push(options.page);
    paramIdx++;
  }
  if (options.device) {
    conditions.push(`device = $${paramIdx}`);
    values.push(options.device);
    paramIdx++;
  }

  const where = conditions.join(" AND ");

  const [countResult, rows] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total FROM session_replays WHERE ${where}`,
      values
    ),
    db.query(
      `SELECT id, visitor_id, session_id, duration_ms, pages, events_count,
              device, started_at, created_at
       FROM session_replays
       WHERE ${where}
       ORDER BY started_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, limit, offset]
    ),
  ]);

  const total = parseInt((countResult as Array<{ total: string }>)[0]?.total || "0", 10);

  const sessions = (rows as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    visitor_id: row.visitor_id as string,
    session_id: row.session_id as string,
    duration_ms: row.duration_ms as number | null,
    pages: (row.pages as string[]) || [],
    events_count: Number(row.events_count) || 0,
    device: row.device as string | null,
    started_at: String(row.started_at),
    created_at: String(row.created_at),
  }));

  return { sessions, total };
}

/**
 * Fetch full replay data for playback (including events).
 */
export async function getReplayData(replayId: string): Promise<ReplayData | null> {
  const db = getDb();
  const rows = await db`
    SELECT id, visitor_id, session_id, storage_key, duration_ms,
           pages, device, started_at
    FROM session_replays
    WHERE id = ${replayId}
    LIMIT 1
  `;

  if (rows.length === 0) return null;

  const row = rows[0];
  let events: ReplayEvent[] = [];
  try {
    const parsed = JSON.parse(row.storage_key as string);
    events = Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    // Corrupted data — return empty events
  }

  return {
    id: row.id as string,
    visitor_id: row.visitor_id as string,
    session_id: row.session_id as string,
    duration_ms: row.duration_ms as number | null,
    pages: (row.pages as string[]) || [],
    device: row.device as string | null,
    started_at: String(row.started_at),
    events,
  };
}

/**
 * Aggregate replay statistics for a project.
 */
export async function getReplayStats(projectId: string): Promise<ReplayStats> {
  const db = getDb();

  const [summary, topPages, devices] = await Promise.all([
    db`
      SELECT
        COUNT(*) AS total_sessions,
        COALESCE(AVG(duration_ms), 0) AS avg_duration_ms,
        COALESCE(SUM(events_count), 0) AS total_events
      FROM session_replays
      WHERE project_id = ${projectId}
    `,
    db`
      SELECT unnest(pages) AS page, COUNT(*) AS count
      FROM session_replays
      WHERE project_id = ${projectId}
      GROUP BY page
      ORDER BY count DESC
      LIMIT 10
    `,
    db`
      SELECT COALESCE(device, 'unknown') AS device, COUNT(*) AS count
      FROM session_replays
      WHERE project_id = ${projectId}
      GROUP BY device
      ORDER BY count DESC
    `,
  ]);

  return {
    total_sessions: parseInt(String(summary[0]?.total_sessions || "0"), 10),
    avg_duration_ms: Math.round(parseFloat(String(summary[0]?.avg_duration_ms || "0"))),
    total_events: parseInt(String(summary[0]?.total_events || "0"), 10),
    top_pages: (topPages as Array<{ page: string; count: string }>).map((r) => ({
      page: r.page,
      count: parseInt(r.count, 10),
    })),
    device_breakdown: (devices as Array<{ device: string; count: string }>).map((r) => ({
      device: r.device,
      count: parseInt(r.count, 10),
    })),
  };
}
