import { getDb } from "@/lib/neon";
import { processPipelineJob } from "@/worker/processors/pipeline";

export type PipelineJobPayload = Record<string, unknown>;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function findRunningPipelineJobForUser(userId: string, excludeJobId?: string) {
  const db = getDb();
  const rows = excludeJobId
    ? await db`
      SELECT id
      FROM job_queue
      WHERE type = 'run_pipeline'
        AND status = 'running'
        AND payload->>'userId' = ${userId}
        AND id <> ${excludeJobId}
      ORDER BY started_at ASC NULLS FIRST, created_at ASC, id ASC
      LIMIT 1
    `
    : await db`
      SELECT id
      FROM job_queue
      WHERE type = 'run_pipeline'
        AND status = 'running'
        AND payload->>'userId' = ${userId}
      ORDER BY started_at ASC NULLS FIRST, created_at ASC, id ASC
      LIMIT 1
    `;

  return (rows[0]?.id as string | undefined) ?? null;
}

export async function cancelPendingPipelineJobsForUser(
  userId: string,
  reason: string,
  excludeJobId?: string
) {
  const db = getDb();

  if (excludeJobId) {
    await db`
      UPDATE job_queue
      SET status = 'failed',
          error = ${reason},
          completed_at = NOW()
      WHERE type = 'run_pipeline'
        AND status = 'pending'
        AND payload->>'userId' = ${userId}
        AND id <> ${excludeJobId}
    `;
    return;
  }

  await db`
    UPDATE job_queue
    SET status = 'failed',
        error = ${reason},
        completed_at = NOW()
    WHERE type = 'run_pipeline'
      AND status = 'pending'
      AND payload->>'userId' = ${userId}
  `;
}

export async function createRunningPipelineJob(payload: PipelineJobPayload) {
  const db = getDb();
  const rows = await db`
    INSERT INTO job_queue (type, payload, status, started_at)
    VALUES ('run_pipeline', ${JSON.stringify(payload)}::jsonb, 'running', NOW())
    RETURNING id
  `;

  return rows[0].id as string;
}

export function startPipelineJobInBackground(jobId: string, payload: PipelineJobPayload) {
  // Let the API return immediately while onboarding continues in the server process.
  void (async () => {
    const db = getDb();

    try {
      await processPipelineJob(jobId, payload);
      await db`
        UPDATE job_queue
        SET status = 'completed',
            completed_at = NOW(),
            error = NULL
        WHERE id = ${jobId}
          AND status = 'running'
      `;
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      console.error(`[pipeline] Job ${jobId} failed:`, error);

      try {
        await db`
          UPDATE job_queue
          SET status = 'failed',
              error = ${errorMessage},
              completed_at = NOW()
          WHERE id = ${jobId}
            AND status = 'running'
        `;
      } catch (updateError) {
        console.error(`[pipeline] Failed to persist job ${jobId} failure:`, updateError);
      }
    }
  })();
}
