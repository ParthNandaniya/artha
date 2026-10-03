import { NextResponse } from "next/server";
import { getDb } from "@/lib/neon";

const FREE_MONTHLY_CREDITS = 5;
const MAX_FREE_CREDITS = 5;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  // Refresh credits for free (non-subscribed) projects that are active
  // Cap at MAX_FREE_CREDITS so credits don't accumulate unbounded
  const result = await db`
    UPDATE projects
    SET task_credits = ${FREE_MONTHLY_CREDITS}
    WHERE status = 'active'
      AND (subscription_status IS NULL OR subscription_status != 'active')
      AND COALESCE(task_credits, 0) < ${MAX_FREE_CREDITS}
  `;

  return NextResponse.json({
    refreshed: (result as any).count ?? result.length,
    creditsGranted: FREE_MONTHLY_CREDITS,
  });
}
