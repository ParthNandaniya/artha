import { NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import { sendDeletionWarningEmail, isTestEmailBlocked } from "@/lib/postmark";

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  // Find projects with pending deletion (expiry set, not yet expired, no credits)
  const projects = await db`
    SELECT p.id, p.slug, p.name, p.website_db_expires_at, p.last_deletion_warning_at, u.email
    FROM projects p
    JOIN users u ON p.user_id = u.id
    WHERE p.website_db_expires_at IS NOT NULL
      AND p.website_db_expires_at > NOW()
      AND COALESCE(p.task_credits, 0) <= 0
      AND (p.last_deletion_warning_at IS NULL OR p.last_deletion_warning_at < NOW() - INTERVAL '7 days')
      AND (p.is_demo IS NULL OR p.is_demo = FALSE)
      AND COALESCE(p.hidden, false) = false
      AND COALESCE(u.hidden, false) = false
  `;

  let sent = 0;
  for (const project of projects) {
    if (isTestEmailBlocked(project.email as string, project.slug as string)) continue;

    const expiresAt = new Date(project.website_db_expires_at as string);
    const daysRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    try {
      await sendDeletionWarningEmail(
        project.email as string,
        project.name as string,
        daysRemaining
      );

      await db`
        UPDATE projects SET last_deletion_warning_at = NOW() WHERE id = ${project.id}
      `;
      sent++;
    } catch (error) {
      console.error(`Failed to send deletion warning for ${project.slug}:`, error);
    }
  }

  return NextResponse.json({ sent, total: projects.length });
}
