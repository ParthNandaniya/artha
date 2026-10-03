import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// ═══════════════════════════════════════════════════════════════════════════
// Platform DB client (singleton)
// ═══════════════════════════════════════════════════════════════════════════

export type DbClient = NeonQueryFunction<false, false>;

let dbClient: DbClient | null = null;

export function getDb() {
  if (!dbClient) {
    dbClient = neon(process.env.DATABASE_URL!);
  }
  return dbClient;
}

// ═══════════════════════════════════════════════════════════════════════════
// Website DB access (isolated Neon DB, subscription-gated)
// For provisioning/lifecycle see: src/lib/website-db.ts
// ═══════════════════════════════════════════════════════════════════════════

export function getCompanyDb(connectionUrl: string): DbClient {
  return neon(connectionUrl);
}

/** Get website DB client for a project. Returns null if not provisioned. */
export async function getWebsiteDbForProject(projectId: string): Promise<DbClient | null> {
  const db = getDb();
  const rows = await db`
    SELECT neon_connection_url FROM projects WHERE id = ${projectId} LIMIT 1
  `;
  if (rows.length === 0 || !rows[0].neon_connection_url) {
    return null;
  }
  return getCompanyDb(rows[0].neon_connection_url);
}

/** Get website DB client for a slug. Returns null if not provisioned. */
export async function getWebsiteDbForSlug(slug: string): Promise<DbClient | null> {
  const db = getDb();
  const rows = await db`
    SELECT neon_connection_url FROM projects WHERE slug = ${slug} LIMIT 1
  `;
  if (rows.length === 0 || !rows[0].neon_connection_url) {
    return null;
  }
  return getCompanyDb(rows[0].neon_connection_url);
}

/**
 * @deprecated Use getWebsiteDbForProject instead. This throws if no DB exists.
 * Kept for backward compatibility during migration.
 */
export async function getCompanyDbForProject(projectId: string) {
  const db = getDb();
  const rows = await db`
    SELECT neon_connection_url FROM projects WHERE id = ${projectId} LIMIT 1
  `;
  if (rows.length === 0 || !rows[0].neon_connection_url) {
    throw new Error(`No company DB for project ${projectId}`);
  }
  return getCompanyDb(rows[0].neon_connection_url);
}

/**
 * @deprecated Use getWebsiteDbForSlug instead. This throws if no DB exists.
 * Kept for backward compatibility during migration.
 */
export async function getCompanyDbForSlug(slug: string) {
  const db = getDb();
  const rows = await db`
    SELECT neon_connection_url FROM projects WHERE slug = ${slug} LIMIT 1
  `;
  if (rows.length === 0 || !rows[0].neon_connection_url) {
    throw new Error(`No company DB for slug ${slug}`);
  }
  return getCompanyDb(rows[0].neon_connection_url);
}

// ═══════════════════════════════════════════════════════════════════════════
// Memory (now stored in platform DB with project_id)
// ═══════════════════════════════════════════════════════════════════════════

export async function setCompanyMemory(projectId: string, key: string, value: unknown) {
  const db = getDb();
  const jsonValue = JSON.stringify(value ?? null);
  await db.query(
    `INSERT INTO memory (project_id, key, value)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (project_id, key) DO UPDATE
     SET value = EXCLUDED.value
     WHERE memory.value IS DISTINCT FROM EXCLUDED.value`,
    [projectId, key, jsonValue]
  );
}

/** Batch-set multiple memory keys atomically in a single transaction. */
export async function setCompanyMemoryBatch(
  projectId: string,
  entries: Record<string, unknown>
) {
  const db = getDb();
  const keys = Object.keys(entries);
  if (keys.length === 0) return;

  // Build a single INSERT ... VALUES (...), (...) with ON CONFLICT
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let idx = 1;
  for (const key of keys) {
    placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}::jsonb)`);
    values.push(projectId, key, JSON.stringify(entries[key] ?? null));
    idx += 3;
  }

  await db.query(
    `INSERT INTO memory (project_id, key, value)
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (project_id, key) DO UPDATE
     SET value = EXCLUDED.value
     WHERE memory.value IS DISTINCT FROM EXCLUDED.value`,
    values
  );
}

export async function getCompanyMemory(projectId: string, key: string): Promise<unknown | null> {
  const db = getDb();
  const rows = await db`SELECT value FROM memory WHERE project_id = ${projectId} AND key = ${key}`;
  return rows.length > 0 ? rows[0].value : null;
}

export async function getCompanyMemoryMap(
  projectId: string,
  keys?: string[]
): Promise<Record<string, unknown>> {
  const db = getDb();
  const rows = keys && keys.length > 0
    ? await db.query(
        "SELECT key, value FROM memory WHERE project_id = $1 AND key = ANY($2::text[])",
        [projectId, keys]
      )
    : await db`SELECT key, value FROM memory WHERE project_id = ${projectId}`;

  const result: Record<string, unknown> = {};
  for (const row of rows as Array<{ key: string; value: unknown }>) {
    result[row.key] = row.value;
  }
  return result;
}

export async function getAllCompanyMemory(projectId: string): Promise<Record<string, unknown>> {
  return getCompanyMemoryMap(projectId);
}
