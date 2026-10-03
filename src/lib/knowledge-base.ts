import { getDb } from "@/lib/neon";

// ── Types ────────────────────────────────────────────────────────────

export interface KBArticle {
  id: string;
  project_id: string;
  title: string;
  content: string;
  category: string;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface ArticleUpdate {
  title?: string;
  content?: string;
  category?: string;
  published?: boolean;
}

// ── Ensure table exists ──────────────────────────────────────────────

let tableEnsured = false;

async function ensureTable() {
  if (tableEnsured) return;
  const db = getDb();
  await db`
    CREATE TABLE IF NOT EXISTS kb_articles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general',
      published BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // Index for listing + search
  await db`
    CREATE INDEX IF NOT EXISTS idx_kb_articles_project
    ON kb_articles (project_id, published, category)
  `;
  tableEnsured = true;
}

// ── CRUD ─────────────────────────────────────────────────────────────

export async function createArticle(
  projectId: string,
  title: string,
  content: string,
  category: string = "general",
): Promise<KBArticle> {
  await ensureTable();
  const db = getDb();
  const rows = await db`
    INSERT INTO kb_articles (project_id, title, content, category)
    VALUES (${projectId}, ${title}, ${content}, ${category})
    RETURNING *
  `;
  return rows[0] as KBArticle;
}

export async function listArticles(
  projectId: string,
  category?: string,
): Promise<KBArticle[]> {
  await ensureTable();
  const db = getDb();

  if (category) {
    const rows = await db`
      SELECT * FROM kb_articles
      WHERE project_id = ${projectId} AND category = ${category}
      ORDER BY updated_at DESC
    `;
    return rows as unknown as KBArticle[];
  }

  const rows = await db`
    SELECT * FROM kb_articles
    WHERE project_id = ${projectId}
    ORDER BY updated_at DESC
  `;
  return rows as unknown as KBArticle[];
}

export async function getArticle(articleId: string): Promise<KBArticle | null> {
  await ensureTable();
  const db = getDb();
  const rows = await db`
    SELECT * FROM kb_articles WHERE id = ${articleId} LIMIT 1
  `;
  return (rows[0] as KBArticle) ?? null;
}

export async function updateArticle(
  articleId: string,
  updates: ArticleUpdate,
): Promise<KBArticle | null> {
  await ensureTable();
  const db = getDb();

  const rows = await db`
    UPDATE kb_articles
    SET
      title      = COALESCE(${updates.title ?? null}, title),
      content    = COALESCE(${updates.content ?? null}, content),
      category   = COALESCE(${updates.category ?? null}, category),
      published  = COALESCE(${updates.published ?? null}, published),
      updated_at = now()
    WHERE id = ${articleId}
    RETURNING *
  `;
  return (rows[0] as KBArticle) ?? null;
}

export async function deleteArticle(articleId: string): Promise<boolean> {
  await ensureTable();
  const db = getDb();
  const rows = await db`
    DELETE FROM kb_articles WHERE id = ${articleId} RETURNING id
  `;
  return rows.length > 0;
}

export async function searchArticles(
  projectId: string,
  query: string,
): Promise<KBArticle[]> {
  await ensureTable();
  const db = getDb();
  const pattern = `%${query}%`;
  const rows = await db`
    SELECT * FROM kb_articles
    WHERE project_id = ${projectId}
      AND (title ILIKE ${pattern} OR content ILIKE ${pattern})
    ORDER BY updated_at DESC
    LIMIT 50
  `;
  return rows as unknown as KBArticle[];
}

/**
 * List only published articles for a project (used by public site API).
 */
export async function listPublishedArticles(
  projectId: string,
  category?: string,
): Promise<KBArticle[]> {
  await ensureTable();
  const db = getDb();

  if (category) {
    const rows = await db`
      SELECT * FROM kb_articles
      WHERE project_id = ${projectId} AND published = true AND category = ${category}
      ORDER BY updated_at DESC
    `;
    return rows as unknown as KBArticle[];
  }

  const rows = await db`
    SELECT * FROM kb_articles
    WHERE project_id = ${projectId} AND published = true
    ORDER BY updated_at DESC
  `;
  return rows as unknown as KBArticle[];
}
