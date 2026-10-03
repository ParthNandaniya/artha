import { NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import { getWebsiteDbStorageBytes } from "@/lib/website-db";
import { getR2StorageBytes } from "@/lib/r2";
import { decrementProjectCredits } from "@/lib/project-credits";
import {
  FREE_STORAGE_BYTES, OVERAGE_CREDITS_PER_100MB, MONTHLY_DB_KEEP_ALIVE_CREDITS,
  FREE_FILE_STORAGE_BYTES, FILE_STORAGE_CREDITS_PER_200MB,
} from "@/lib/database/constants";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  // Bill ALL projects with a website DB (not just subscribed ones)
  const projects = await db`
    SELECT p.id, p.slug, p.name, p.subscription_status, p.task_credits, p.website_db_expires_at
    FROM projects p
    WHERE p.neon_connection_url IS NOT NULL
  `;

  let billed = 0;

  for (const project of projects) {
    try {
      const isSubscribed = project.subscription_status === "active";
      const credits = Number(project.task_credits) || 0;
      const slug = project.slug as string;

      // Fetch DB storage from Neon
      const dbBytes = await getWebsiteDbStorageBytes(project.id as string);

      // Fetch file storage from R2 (all files under this project's slug prefix)
      let fileBytes = 0;
      try {
        fileBytes = await getR2StorageBytes(`${slug}/`);
      } catch {
        // R2 not configured or error — skip file billing
      }

      // Calculate DB overage cost (applies to all projects)
      let totalCredits = 0;
      let dbOverageCredits = 0;
      if (dbBytes > FREE_STORAGE_BYTES) {
        const overageBlocks = Math.ceil((dbBytes - FREE_STORAGE_BYTES) / FREE_STORAGE_BYTES);
        dbOverageCredits = overageBlocks * OVERAGE_CREDITS_PER_100MB;
        totalCredits += dbOverageCredits;
      }

      // Calculate file storage cost (1 credit per 200MB, first 200MB free)
      let fileOverageCredits = 0;
      if (fileBytes > FREE_FILE_STORAGE_BYTES) {
        const overageBlocks = Math.ceil((fileBytes - FREE_FILE_STORAGE_BYTES) / FREE_FILE_STORAGE_BYTES);
        fileOverageCredits = overageBlocks * FILE_STORAGE_CREDITS_PER_200MB;
        totalCredits += fileOverageCredits;
      }

      // Non-subscribed projects also pay the base keep-alive cost
      if (!isSubscribed) {
        totalCredits += MONTHLY_DB_KEEP_ALIVE_CREDITS;
      }

      if (totalCredits > 0) {
        await decrementProjectCredits(db, project.id as string, totalCredits);
        billed++;
      }

      // Update cached display values
      await db`
        UPDATE projects
        SET website_db_overage_credits = ${dbOverageCredits},
            file_storage_bytes = ${fileBytes},
            file_storage_overage_credits = ${fileOverageCredits}
        WHERE id = ${project.id}
      `;

      // For non-subscribed projects: manage expiry based on remaining credits
      if (!isSubscribed) {
        const remainingCredits = Math.max(credits - totalCredits, 0);

        if (remainingCredits <= 0 && !project.website_db_expires_at) {
          // No credits left and no subscription — start 2-month countdown
          await db`
            UPDATE projects
            SET website_db_expires_at = NOW() + INTERVAL '2 months',
                last_deletion_warning_at = NOW()
            WHERE id = ${project.id}
          `;
        } else if (remainingCredits > 0 && project.website_db_expires_at) {
          // Has credits now — clear expiry countdown
          await db`
            UPDATE projects
            SET website_db_expires_at = NULL,
                last_deletion_warning_at = NULL
            WHERE id = ${project.id}
          `;
        }
      }
    } catch (error) {
      console.error(`Usage billing error for ${project.slug}:`, error);
    }
  }

  return NextResponse.json({ checked: projects.length, billed });
}
