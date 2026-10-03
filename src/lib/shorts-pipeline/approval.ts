/**
 * Content Approval System
 *
 * Manages the approval queue for video shorts before posting.
 */

import { getDb } from "@/lib/neon";
import type { VideoShort } from "./types";

function log(msg: string) {
  console.log(`[shorts-approval] ${msg}`);
}

/**
 * Queue a video short for approval.
 */
export async function queueForApproval(videoShortId: string): Promise<void> {
  const db = getDb();
  await db`
    UPDATE video_shorts
    SET status = 'pending_approval', updated_at = now()
    WHERE id = ${videoShortId}
  `;
  log(`Video ${videoShortId} queued for approval`);
}

/**
 * Approve a video short for posting.
 */
export async function approveVideo(videoShortId: string, userId?: string): Promise<void> {
  const db = getDb();
  await db`
    UPDATE video_shorts
    SET status = 'approved',
        approved_by = ${userId || null},
        approved_at = now(),
        updated_at = now()
    WHERE id = ${videoShortId}
  `;
  log(`Video ${videoShortId} approved`);
}

/**
 * Reject a video short.
 */
export async function rejectVideo(videoShortId: string, reason: string, userId?: string): Promise<void> {
  const db = getDb();
  await db`
    UPDATE video_shorts
    SET status = 'failed',
        rejection_reason = ${reason},
        approved_by = ${userId || null},
        updated_at = now()
    WHERE id = ${videoShortId}
  `;
  log(`Video ${videoShortId} rejected: ${reason}`);
}

/**
 * List pending approvals for a project.
 */
export async function listPendingApprovals(projectId?: string | null): Promise<VideoShort[]> {
  const db = getDb();

  if (projectId) {
    const rows = await db`
      SELECT * FROM video_shorts
      WHERE project_id = ${projectId} AND status = 'pending_approval'
      ORDER BY created_at DESC
    `;
    return rows as unknown as VideoShort[];
  }

  // All pending (for Artha internal)
  const rows = await db`
    SELECT * FROM video_shorts
    WHERE status = 'pending_approval'
    ORDER BY created_at DESC
  `;
  return rows as unknown as VideoShort[];
}

/**
 * Auto-approve if project config allows it.
 */
export async function autoApproveIfConfigured(
  videoShortId: string,
  projectId?: string | null,
): Promise<boolean> {
  const db = getDb();

  if (!projectId) {
    // Artha internal — always auto-approve
    await approveVideo(videoShortId);
    return true;
  }

  const rows = await db`
    SELECT auto_approve FROM video_shorts_config
    WHERE project_id = ${projectId}
  `;

  if (rows.length > 0 && rows[0].auto_approve) {
    await approveVideo(videoShortId);
    return true;
  }

  await queueForApproval(videoShortId);
  return false;
}

/**
 * Get recent topics to avoid duplicates.
 */
export async function getRecentTopics(limit = 20): Promise<string[]> {
  const db = getDb();
  const rows = await db`
    SELECT topic FROM video_shorts
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => r.topic as string);
}

/**
 * Count videos created this week for rate limiting.
 */
export async function getWeeklyVideoCount(projectId?: string | null): Promise<number> {
  const db = getDb();

  if (projectId) {
    const rows = await db`
      SELECT COUNT(*) as count FROM video_shorts
      WHERE project_id = ${projectId}
        AND created_at >= now() - INTERVAL '7 days'
    `;
    return Number(rows[0]?.count || 0);
  }

  const rows = await db`
    SELECT COUNT(*) as count FROM video_shorts
    WHERE project_id IS NULL
      AND created_at >= now() - INTERVAL '7 days'
  `;
  return Number(rows[0]?.count || 0);
}
