import { NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import { getR2SignedUrl } from "@/lib/r2";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Missing job id" }, { status: 400 });
  }

  const db = getDb();
  const rows = await db`
    SELECT id, script, voice_id, avatar_type, avatar_id, status, final_video_key,
           duration_seconds, error, created_at
    FROM ugc_video_jobs
    WHERE id = ${id}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const job = rows[0];

  // Generate a fresh signed URL if the video is ready
  let videoUrl: string | null = null;
  if (job.status === "done" && job.final_video_key) {
    videoUrl = await getR2SignedUrl(job.final_video_key, 86400);
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    script: job.script,
    voiceId: job.voice_id,
    avatarType: job.avatar_type,
    avatarId: job.avatar_id,
    videoUrl,
    durationSeconds: job.duration_seconds ? Number(job.duration_seconds) : null,
    error: job.error,
    createdAt: job.created_at,
  });
}
