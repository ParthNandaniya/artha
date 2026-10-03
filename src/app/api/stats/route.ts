import { NextResponse } from "next/server";
import { getDb } from "@/lib/neon";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export async function GET() {
  const db = getDb();

  const [result] = await db`
    SELECT
      COUNT(*)::int AS total_companies,
      COUNT(*) FILTER (WHERE landing_page_published = TRUE AND COALESCE(hidden, false) = false)::int AS published_companies
    FROM projects
    WHERE status = 'active'
  `;

  return NextResponse.json(
    {
      totalCompanies: result.total_companies,
      publishedCompanies: result.published_companies,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    }
  );
}
