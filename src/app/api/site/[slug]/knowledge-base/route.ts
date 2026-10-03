import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import { listPublishedArticles } from "@/lib/knowledge-base";
import { createRateLimiter, getClientIp, corsHeaders, handlePreflight } from "@/lib/site-api";

// ── Rate limiting: 30 req/min per IP ─────────────────────────────────
const isRateLimited = createRateLimiter(30);

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request);
}

/**
 * GET /api/site/[slug]/knowledge-base
 * Public endpoint — lists published KB articles for a company site.
 * Query params:
 *   - category (optional): filter by category
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  // Rate limit
  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers },
    );
  }

  // Resolve project by slug
  const db = getDb();
  const projectRows = await db`
    SELECT id FROM projects WHERE slug = ${slug} LIMIT 1
  `;
  if (projectRows.length === 0) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers },
    );
  }

  const projectId = projectRows[0].id as string;

  // Optional category filter
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") ?? undefined;

  const articles = await listPublishedArticles(projectId, category);

  // Strip content body for listing (return summaries only)
  const items = articles.map((a) => ({
    id: a.id,
    title: a.title,
    category: a.category,
    summary: a.content.slice(0, 200) + (a.content.length > 200 ? "..." : ""),
    created_at: a.created_at,
    updated_at: a.updated_at,
  }));

  return NextResponse.json({ articles: items }, { headers });
}
