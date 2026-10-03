import { NextResponse } from "next/server";
import { deleteExpiredWebsiteDbs } from "@/lib/website-db";
import { deleteR2Prefix } from "@/lib/r2";
import { getDb } from "@/lib/neon";
import { sendDataDeletedEmail } from "@/lib/postmark";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  // Before deleting, clear expiry for projects that now have credits
  // (they may have purchased more since the countdown started)
  await db`
    UPDATE projects
    SET website_db_expires_at = NULL,
        last_deletion_warning_at = NULL
    WHERE website_db_expires_at IS NOT NULL
      AND COALESCE(task_credits, 0) > 0
  `;

  // Get project info before deletion for email notifications
  const expiredProjects = await db`
    SELECT p.id, p.slug, p.name, u.email
    FROM projects p
    JOIN users u ON p.user_id = u.id
    WHERE p.website_db_expires_at IS NOT NULL
      AND p.website_db_expires_at < NOW()
      AND p.neon_project_id IS NOT NULL
      AND COALESCE(p.hidden, false) = false
      AND COALESCE(u.hidden, false) = false
  `;

  const { deleted } = await deleteExpiredWebsiteDbs();

  // Delete R2 files and send deletion notification emails
  for (const project of expiredProjects) {
    if (deleted.includes(project.slug as string)) {
      // Delete all files from R2 for this project
      try {
        const filesDeleted = await deleteR2Prefix(`${project.slug}/`);
        if (filesDeleted > 0) {
          console.log(`Deleted ${filesDeleted} R2 files for ${project.slug}`);
        }
        // Clear file storage tracking
        await db`
          UPDATE projects SET file_storage_bytes = 0, file_storage_overage_credits = 0
          WHERE id = ${project.id}
        `;
      } catch (error) {
        console.error(`Failed to delete R2 files for ${project.slug}:`, error);
      }

      try {
        await sendDataDeletedEmail(
          project.email as string,
          project.name as string
        );
      } catch (error) {
        console.error(`Failed to send deletion email for ${project.slug}:`, error);
      }
    }
  }

  return NextResponse.json({ deleted });
}
