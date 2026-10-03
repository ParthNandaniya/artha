import { getDb } from "@/lib/neon";

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  tags: string[];
  status: string;
  seoTitle: string | null;
  seoDescription: string | null;
  sourceType: string | null;
  sourceTweetPostId: string | null;
  coverImageUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BlogPostInput {
  slug: string;
  title: string;
  excerpt?: string;
  content: string;
  tags?: string[];
  seoTitle?: string;
  seoDescription?: string;
  sourceType?: string;
  sourceTweetPostId?: string;
  coverImageUrl?: string;
}

function rowToPost(row: Record<string, unknown>): BlogPost {
  return {
    id: row.id as string,
    slug: row.slug as string,
    title: row.title as string,
    excerpt: (row.excerpt as string) || null,
    content: row.content as string,
    tags: (row.tags as string[]) || [],
    status: row.status as string,
    seoTitle: (row.seo_title as string) || null,
    seoDescription: (row.seo_description as string) || null,
    sourceType: (row.source_type as string) || null,
    sourceTweetPostId: (row.source_tweet_post_id as string) || null,
    coverImageUrl: (row.cover_image_url as string) || null,
    publishedAt: row.published_at ? String(row.published_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function getPublishedPosts(
  page: number = 1,
  limit: number = 12,
): Promise<BlogPost[]> {
  const db = getDb();
  const offset = (page - 1) * limit;
  const rows = await db`
    SELECT * FROM blog_posts
    WHERE status = 'published'
    ORDER BY published_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return rows.map((r) => rowToPost(r as Record<string, unknown>));
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM blog_posts WHERE slug = ${slug} AND status = 'published' LIMIT 1
  `;
  return rows.length > 0 ? rowToPost(rows[0] as Record<string, unknown>) : null;
}

export async function getRecentPosts(limit: number = 5): Promise<BlogPost[]> {
  const db = getDb();
  const rows = await db`
    SELECT id, slug, title, excerpt, tags, published_at FROM blog_posts
    WHERE status = 'published'
    ORDER BY published_at DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => rowToPost(r as Record<string, unknown>));
}

export async function getPostCount(): Promise<number> {
  const db = getDb();
  const rows = await db`SELECT COUNT(*)::int AS count FROM blog_posts WHERE status = 'published'`;
  return (rows[0]?.count as number) || 0;
}

export async function createBlogPost(input: BlogPostInput): Promise<BlogPost> {
  const db = getDb();
  const rows = await db`
    INSERT INTO blog_posts (slug, title, excerpt, content, tags, seo_title, seo_description, source_type, source_tweet_post_id, cover_image_url, status, published_at)
    VALUES (
      ${input.slug},
      ${input.title},
      ${input.excerpt || null},
      ${input.content},
      ${input.tags || []},
      ${input.seoTitle || null},
      ${input.seoDescription || null},
      ${input.sourceType || null},
      ${input.sourceTweetPostId || null},
      ${input.coverImageUrl || null},
      'published',
      NOW()
    )
    RETURNING *
  `;
  return rowToPost(rows[0] as Record<string, unknown>);
}

export async function updateBlogPostCover(slug: string, coverImageUrl: string): Promise<void> {
  const db = getDb();
  await db`UPDATE blog_posts SET cover_image_url = ${coverImageUrl}, updated_at = NOW() WHERE slug = ${slug}`;
}

export async function publishedTodayCount(): Promise<number> {
  const db = getDb();
  const rows = await db`
    SELECT COUNT(*)::int AS count FROM blog_posts
    WHERE status = 'published'
      AND published_at >= CURRENT_DATE
      AND published_at < CURRENT_DATE + INTERVAL '1 day'
  `;
  return (rows[0]?.count as number) || 0;
}

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  const db = getDb();
  let slug = baseSlug;
  let attempt = 0;
  while (attempt < 10) {
    const rows = await db`SELECT 1 FROM blog_posts WHERE slug = ${slug} LIMIT 1`;
    if (rows.length === 0) return slug;
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }
  return `${baseSlug}-${Date.now()}`;
}

export async function getUnbloggedThreads(
  limit: number = 5,
): Promise<Array<{ id: string; category: string; content: string; topic: string; metadata: Record<string, unknown> }>> {
  const db = getDb();
  const rows = await db`
    SELECT t.id, t.category, t.content, t.topic, t.metadata
    FROM twitter_bot_posts t
    WHERE t.category IN ('thread', 'article')
      AND t.status = 'posted'
      AND NOT EXISTS (
        SELECT 1 FROM blog_posts b WHERE b.source_tweet_post_id = t.id
      )
    ORDER BY t.posted_at DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id as string,
    category: r.category as string,
    content: r.content as string,
    topic: (r.topic as string) || "",
    metadata: (r.metadata as Record<string, unknown>) || {},
  }));
}

export async function getRecentPostTitles(limit: number = 20): Promise<string[]> {
  const db = getDb();
  const rows = await db`
    SELECT title FROM blog_posts ORDER BY created_at DESC LIMIT ${limit}
  `;
  return rows.map((r) => r.title as string);
}

export function estimateReadingTime(html: string): number {
  const text = html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
  const words = text.split(" ").length;
  return Math.max(1, Math.ceil(words / 200));
}

export function formatPublishedDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
