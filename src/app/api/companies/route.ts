import { NextResponse } from "next/server";
import { getDb } from "@/lib/neon";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const limit = Math.min(parseInt(limitParam || "100", 10) || 100, 100);

  const db = getDb();
  const rows = await db`
    SELECT
      p.slug,
      p.name,
      cp.tagline
    FROM projects p
    LEFT JOIN company_profile cp ON cp.project_id = p.id
    WHERE p.landing_page_published = TRUE
      AND p.slug IS NOT NULL
      AND p.status = 'active'
      AND COALESCE(p.hidden, false) = false
      AND COALESCE((cp.settings->>'show_in_showcase')::boolean, true) = true
    ORDER BY p.created_at DESC
    LIMIT ${limit}
  `;

  return NextResponse.json(rows);
}
