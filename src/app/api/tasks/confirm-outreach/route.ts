import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { incrementProjectCredits } from "@/lib/project-credits";
import { canSendProjectEmail, getEmailSetupBlockedReason } from "@/lib/project-integrations";
import { processOutreachEmails } from "@/lib/outreach";

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId, projectId, emails, action } = await request.json() as {
    taskId: string;
    projectId: string;
    emails?: Array<{ to: string; toName?: string; subject: string; body: string }>;
    action: "send" | "cancel";
  };

  const db = getDb();
  const projects = await db`
    SELECT *
    FROM projects WHERE id = ${projectId} AND user_id = ${user.id}
  `;
  if (projects.length === 0) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const project = projects[0];

  const tasks = await db`SELECT id, status, result FROM tasks WHERE id = ${taskId} AND project_id = ${projectId}`;
  if (tasks.length === 0) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const task = tasks[0];
  if (task.status !== "pending_confirmation") {
    return NextResponse.json({ error: "Task is not pending confirmation" }, { status: 400 });
  }

  if (action === "cancel") {
    await db`
      UPDATE tasks SET status = 'queued', result = NULL, summary = 'Cancelled by user — returned to queue'
      WHERE id = ${taskId} AND project_id = ${projectId}
    `;
    await incrementProjectCredits(db, projectId, 1);
    return NextResponse.json({ success: true, action: "cancelled" });
  }

  if (!canSendProjectEmail(project)) {
    return NextResponse.json(
      { error: getEmailSetupBlockedReason(project) || "Email setup is not ready yet." },
      { status: 409 }
    );
  }

  const emailsToSend = emails || parseEmailsFromResult(task.result);
  if (!emailsToSend || emailsToSend.length === 0) {
    return NextResponse.json({ error: "No emails to send" }, { status: 400 });
  }

  const outreachResult = await processOutreachEmails({
    projectId,
    slug: project.slug as string,
    companyName: project.name as string,
    emails: emailsToSend,
  });

  const parts = [`Sent ${outreachResult.sent} email${outreachResult.sent === 1 ? "" : "s"}`];
  if (outreachResult.failed > 0) parts.push(`${outreachResult.failed} failed`);
  if (outreachResult.skipped > 0) parts.push(`${outreachResult.skipped} skipped (no email)`);
  if (outreachResult.creditLimited > 0) parts.push(`${outreachResult.creditLimited} not sent (insufficient credits)`);
  const summary = parts.join(", ");

  await db`
    UPDATE tasks SET status = 'completed', summary = ${summary}, completed_at = NOW()
    WHERE id = ${taskId} AND project_id = ${projectId}
  `;

  return NextResponse.json({
    success: true,
    sent: outreachResult.sent,
    failed: outreachResult.failed,
    skipped: outreachResult.skipped,
    creditLimited: outreachResult.creditLimited,
    unsent: outreachResult.unsent,
    summary,
  });
}

function parseEmailsFromResult(result: unknown): Array<{ to: string; toName?: string; subject: string; body: string }> | null {
  if (!result) return null;
  try {
    const parsed = typeof result === "string" ? JSON.parse(result) : result;
    return parsed.emails || null;
  } catch {
    return null;
  }
}
