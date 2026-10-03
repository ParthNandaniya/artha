import { getDb } from "@/lib/neon";
export { getDb };

export async function emitPipelineEvent(
  jobId: string,
  projectId: string | null,
  step: string,
  status: string,
  logMessage?: string,
  logType?: string,
  data?: Record<string, unknown>
) {
  const db = getDb();
  await db`
    INSERT INTO pipeline_events (job_id, project_id, step, status, log_message, log_type, data)
    VALUES (${jobId}, ${projectId}, ${step}, ${status}, ${logMessage || null}, ${logType || "info"}, ${data ? JSON.stringify(data) : null}::jsonb)
  `;
}
