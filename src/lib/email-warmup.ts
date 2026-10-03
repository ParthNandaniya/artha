import { getDb } from "@/lib/neon";

// ═══════════════════════════════════════════════════════════════════════════
// Email Warmup Orchestration
// ═══════════════════════════════════════════════════════════════════════════

export type WarmupStatus = "pending" | "active" | "paused" | "completed";

export interface WarmupState {
  project_id: string;
  warmup_day: number;
  daily_volume: number;
  status: WarmupStatus;
  started_at: string | null;
  updated_at: string;
}

/**
 * Volume schedule: ramps up sending capacity over 21 days.
 * Day 1-3: 5/day, 4-7: 10/day, 8-14: 20/day, 15-21: 50/day, 22+: completed
 */
function volumeForDay(day: number): number {
  if (day <= 3) return 5;
  if (day <= 7) return 10;
  if (day <= 14) return 20;
  if (day <= 21) return 50;
  return 50; // completed — keeps max volume
}

/** Returns current warmup state for a project, or null if not started. */
export async function getWarmupStatus(projectId: string): Promise<WarmupState | null> {
  const db = getDb();
  const rows = await db`
    SELECT project_id, warmup_day, daily_volume, status, started_at, updated_at
    FROM email_warmup_status
    WHERE project_id = ${projectId}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return rows[0] as WarmupState;
}

/** Creates a warmup record at day 0 with status 'active'. */
export async function startWarmup(projectId: string): Promise<WarmupState> {
  const db = getDb();
  const now = new Date().toISOString();
  const initialVolume = volumeForDay(1);

  const rows = await db`
    INSERT INTO email_warmup_status (project_id, warmup_day, daily_volume, status, started_at, updated_at)
    VALUES (${projectId}, 0, ${initialVolume}, 'active', ${now}, ${now})
    ON CONFLICT (project_id) DO UPDATE SET
      warmup_day = 0,
      daily_volume = ${initialVolume},
      status = 'active',
      started_at = ${now},
      updated_at = ${now}
    RETURNING project_id, warmup_day, daily_volume, status, started_at, updated_at
  `;
  return rows[0] as WarmupState;
}

/**
 * Advances warmup by one day. Updates volume based on schedule.
 * Marks as 'completed' once day > 21.
 */
export async function advanceWarmup(projectId: string): Promise<WarmupState | null> {
  const db = getDb();
  const current = await getWarmupStatus(projectId);
  if (!current || current.status !== "active") return current;

  const nextDay = current.warmup_day + 1;
  const isCompleted = nextDay > 21;
  const nextVolume = volumeForDay(nextDay);
  const nextStatus: WarmupStatus = isCompleted ? "completed" : "active";
  const now = new Date().toISOString();

  const rows = await db`
    UPDATE email_warmup_status
    SET warmup_day = ${nextDay},
        daily_volume = ${nextVolume},
        status = ${nextStatus},
        updated_at = ${now}
    WHERE project_id = ${projectId}
    RETURNING project_id, warmup_day, daily_volume, status, started_at, updated_at
  `;
  return rows.length > 0 ? (rows[0] as WarmupState) : null;
}

/** Pauses the warmup (freezes day counter). */
export async function pauseWarmup(projectId: string): Promise<WarmupState | null> {
  const db = getDb();
  const now = new Date().toISOString();
  const rows = await db`
    UPDATE email_warmup_status
    SET status = 'paused', updated_at = ${now}
    WHERE project_id = ${projectId} AND status = 'active'
    RETURNING project_id, warmup_day, daily_volume, status, started_at, updated_at
  `;
  return rows.length > 0 ? (rows[0] as WarmupState) : null;
}

/** Resumes a paused warmup. */
export async function resumeWarmup(projectId: string): Promise<WarmupState | null> {
  const db = getDb();
  const now = new Date().toISOString();
  const rows = await db`
    UPDATE email_warmup_status
    SET status = 'active', updated_at = ${now}
    WHERE project_id = ${projectId} AND status = 'paused'
    RETURNING project_id, warmup_day, daily_volume, status, started_at, updated_at
  `;
  return rows.length > 0 ? (rows[0] as WarmupState) : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Email Send Tracking & Rate Limiting
// ═══════════════════════════════════════════════════════════════════════════

// Warmup schedule: gradual ramp-up of sends per day based on project age
const WARMUP_SCHEDULE: Record<number, number> = {
  7: 5,     // Day 1-7: max 5 emails/day
  14: 15,   // Day 8-14: max 15/day
  21: 30,   // Day 15-21: max 30/day
  999: 50,  // Day 22+: max 50/day
};

function getWarmupDay(projectCreatedAt: Date): number {
  const daysSinceCreation = Math.floor(
    (Date.now() - projectCreatedAt.getTime()) / 86_400_000,
  );
  return daysSinceCreation + 1; // 1-indexed
}

function getDailyLimit(warmupDay: number): number {
  for (const [maxDay, limit] of Object.entries(WARMUP_SCHEDULE)) {
    if (warmupDay <= Number(maxDay)) return limit;
  }
  return 50;
}

export async function canSendEmail(projectId: string): Promise<{
  allowed: boolean;
  dailyRemaining: number;
  warmupDay: number;
  dailyLimit: number;
}> {
  const db = getDb();

  // Get project creation date
  const project = await db`
    SELECT created_at FROM projects WHERE id = ${projectId}
  `;

  if (!project[0]) {
    return { allowed: false, dailyRemaining: 0, warmupDay: 0, dailyLimit: 0 };
  }

  const warmupDay = getWarmupDay(new Date(project[0].created_at as string));
  const dailyLimit = getDailyLimit(warmupDay);

  // Count today's sends
  const today = await db`
    SELECT COUNT(*) as count FROM email_sends
    WHERE project_id = ${projectId} AND sent_at >= CURRENT_DATE
  `;

  const sentToday = parseInt(String(today[0]?.count || "0"));
  const dailyRemaining = Math.max(0, dailyLimit - sentToday);

  return {
    allowed: dailyRemaining > 0,
    dailyRemaining,
    warmupDay,
    dailyLimit,
  };
}

export async function recordEmailSend(
  projectId: string,
  recipient: string,
  subject?: string,
): Promise<void> {
  const db = getDb();
  await db`
    INSERT INTO email_sends (project_id, recipient, subject)
    VALUES (${projectId}, ${recipient}, ${subject || null})
  `;
}

export async function handleBounce(
  projectId: string,
  recipient: string,
  bounceType: "hard" | "soft",
): Promise<void> {
  const db = getDb();
  // Update the most recent send to this recipient as bounced
  await db`
    UPDATE email_sends
    SET status = 'bounced', bounce_type = ${bounceType}
    WHERE id = (
      SELECT id FROM email_sends
      WHERE project_id = ${projectId} AND recipient = ${recipient}
      ORDER BY sent_at DESC
      LIMIT 1
    )
  `;
}

export async function getProjectBounceRate(projectId: string): Promise<number> {
  const db = getDb();
  const result = await db`
    SELECT
      COUNT(*) FILTER (WHERE status = 'bounced') as bounced,
      COUNT(*) as total
    FROM email_sends
    WHERE project_id = ${projectId} AND sent_at >= NOW() - INTERVAL '30 days'
  `;

  const { bounced, total } = result[0] || { bounced: 0, total: 0 };
  return Number(total) > 0 ? Number(bounced) / Number(total) : 0;
}
