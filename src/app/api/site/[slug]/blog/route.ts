import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";

// CORS headers for company site access
function corsHeaders(origin: string | null) {
  const allowed =
    !origin ||
    origin.endsWith(".tryartha.com") ||
    origin === "https://tryartha.com" ||
    process.env.NODE_ENV === "development";

  return {
    "Access-Control-Allow-Origin": allowed ? (origin ?? "*") : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

/**
 * GET /api/site/[slug]/blog — List published blog posts (public)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const db = getDb();

  const rows = await db`SELECT id FROM projects WHERE slug = ${slug} LIMIT 1`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  }
  const projectId = rows[0].id as string;

  // Check for internal auth (API key) — allows seeing drafts
  const authHeader = request.headers.get("authorization");
  const isInternal = authHeader === `Bearer ${process.env.INTERNAL_API_KEY}`;

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status");

  if (statusFilter === "all" && isInternal) {
    const posts = await db`
      SELECT id, slug, title, excerpt, cover_image_url, status, published_at, tags, created_at, updated_at
      FROM company_blog_posts
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC
      LIMIT 100
    `;
    return NextResponse.json({ posts }, { headers });
  }

  // Public: only published posts
  const posts = await db`
    SELECT id, slug, title, excerpt, cover_image_url, published_at, tags
    FROM company_blog_posts
    WHERE project_id = ${projectId} AND status = 'published'
    ORDER BY published_at DESC NULLS LAST
    LIMIT 50
  `;

  return NextResponse.json({ posts }, { headers });
}

/**
 * POST /api/site/[slug]/blog — Create a new blog post (internal/AI agent only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  // Internal auth — blog posts are created by AI agents or the dashboard
  const authHeader = request.headers.get("authorization");
  const isInternal = authHeader === `Bearer ${process.env.INTERNAL_API_KEY}`;
  if (!isInternal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  const db = getDb();
  const rows = await db`SELECT id FROM projects WHERE slug = ${slug} LIMIT 1`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  }
  const projectId = rows[0].id as string;

  const body = await request.json() as {
    title: string;
    content: string;
    excerpt?: string;
    coverImageUrl?: string;
    tags?: string[];
    status?: string;
    seoTitle?: string;
    seoDescription?: string;
  };

  if (!body.title?.trim() || !body.content?.trim()) {
    return NextResponse.json({ error: "Title and content are required" }, { status: 400, headers });
  }

  // Generate slug from title
  const postSlug = body.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);

  const status = body.status === "published" ? "published" : "draft";
  const publishedAt = status === "published" ? new Date().toISOString() : null;

  const result = await db`
    INSERT INTO company_blog_posts (project_id, slug, title, content, excerpt, cover_image_url, status, published_at, seo_title, seo_description, tags)
    VALUES (
      ${projectId}, ${postSlug}, ${body.title.trim()}, ${body.content.trim()},
      ${body.excerpt?.trim() || null}, ${body.coverImageUrl || null},
      ${status}, ${publishedAt},
      ${body.seoTitle?.trim() || null}, ${body.seoDescription?.trim() || null},
      ${body.tags || []}
    )
    ON CONFLICT (project_id, slug) DO UPDATE SET
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      excerpt = EXCLUDED.excerpt,
      cover_image_url = EXCLUDED.cover_image_url,
      status = EXCLUDED.status,
      published_at = COALESCE(EXCLUDED.published_at, company_blog_posts.published_at),
      seo_title = EXCLUDED.seo_title,
      seo_description = EXCLUDED.seo_description,
      tags = EXCLUDED.tags,
      updated_at = NOW()
    RETURNING id, slug, status
  `;

  return NextResponse.json({ post: result[0] }, { status: 201, headers });
}
