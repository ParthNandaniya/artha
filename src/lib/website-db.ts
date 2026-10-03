import { neon } from "@neondatabase/serverless";
import { getDb } from "./neon";

const NEON_API_BASE = "https://console.neon.tech/api/v2";

interface NeonProjectResponse {
  project: { id: string; name: string };
  connection_uris: Array<{ connection_uri: string }>;
}

// ── Provision a new website DB (subscription-gated) ────────────────

export async function provisionWebsiteDb(
  projectId: string,
  slug: string
): Promise<{ neonProjectId: string; connectionUrl: string }> {
  const orgId = process.env.NEON_PAID_ORG_ID || process.env.NEON_ORG_ID;
  const res = await fetch(`${NEON_API_BASE}/projects`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NEON_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      project: {
        name: `artha-${slug}`,
        ...(orgId ? { org_id: orgId } : {}),
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    if (err.includes("org_id is required")) {
      throw new Error("Failed to provision Neon project: org_id is required. Set NEON_ORG_ID in environment.");
    }
    throw new Error(`Failed to provision Neon project: ${err}`);
  }

  const data: NeonProjectResponse = await res.json();
  const neonProjectId = data.project.id;
  const connectionUrl = data.connection_uris[0]?.connection_uri;
  if (!connectionUrl) throw new Error("No connection URI returned from Neon");

  const db = getDb();
  await db`
    UPDATE projects
    SET neon_project_id = ${neonProjectId},
        neon_connection_url = ${connectionUrl},
        website_db_expires_at = NULL,
        last_deletion_warning_at = NULL
    WHERE id = ${projectId}
  `;

  // Init website DB schema (only website-specific tables)
  await initializeWebsiteSchema(connectionUrl);

  // Restore custom tables from saved schema if re-subscribing
  await restoreCustomTablesFromBackup(projectId, connectionUrl);

  return { neonProjectId, connectionUrl };
}

// ── Initialize website DB schema (isolated DB tables only) ─────────

async function initializeWebsiteSchema(connectionUrl: string) {
  const websiteDb = neon(connectionUrl);

  await websiteDb`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

  await websiteDb`
    CREATE TABLE IF NOT EXISTS site_config (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await websiteDb`
    CREATE TABLE IF NOT EXISTS site_users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      avatar_url TEXT,
      metadata JSONB DEFAULT '{}',
      verified BOOLEAN DEFAULT FALSE,
      last_sign_in_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await websiteDb`
    CREATE TABLE IF NOT EXISTS site_payments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      site_user_id UUID REFERENCES site_users(id) ON DELETE SET NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT DEFAULT 'usd',
      plan_slug TEXT,
      stripe_session_id TEXT,
      stripe_payment_intent_id TEXT,
      status TEXT DEFAULT 'pending',
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Schema registry for custom tables (AI-created)
  await websiteDb`
    CREATE TABLE IF NOT EXISTS _schema_registry (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      table_name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'custom',
      template_id TEXT,
      columns JSONB NOT NULL DEFAULT '[]',
      indexes JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // ── Auth + Credits extensions (idempotent) ──────────────────────────

  // Add auth/credit columns to site_users
  await websiteDb`ALTER TABLE site_users ADD COLUMN IF NOT EXISTS password_hash TEXT`;
  await websiteDb`ALTER TABLE site_users ADD COLUMN IF NOT EXISTS credits NUMERIC(10,2) DEFAULT 0`;
  await websiteDb`ALTER TABLE site_users ADD COLUMN IF NOT EXISTS verification_token_hash TEXT`;
  await websiteDb`ALTER TABLE site_users ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ`;

  // Sessions table for bearer token auth
  await websiteDb`
    CREATE TABLE IF NOT EXISTS site_sessions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      site_user_id UUID NOT NULL REFERENCES site_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await websiteDb`CREATE INDEX IF NOT EXISTS idx_site_sessions_token ON site_sessions(token_hash)`;

  // Credit transactions audit trail
  await websiteDb`
    CREATE TABLE IF NOT EXISTS credit_transactions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      site_user_id UUID NOT NULL REFERENCES site_users(id) ON DELETE CASCADE,
      amount NUMERIC(10,2) NOT NULL,
      type TEXT NOT NULL DEFAULT 'deduction',
      reason TEXT,
      reference_id TEXT,
      balance_after NUMERIC(10,2) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await websiteDb`CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions(site_user_id, created_at)`;
}

// ── Restore custom tables from backup (on re-subscribe) ────────────

async function restoreCustomTablesFromBackup(projectId: string, connectionUrl: string) {
  const db = getDb();
  const rows = await db`
    SELECT schema_sql, table_definitions FROM saved_website_schemas
    WHERE project_id = ${projectId} LIMIT 1
  `;
  if (rows.length === 0) return;

  const { schema_sql, table_definitions } = rows[0];
  const websiteDb = neon(connectionUrl);

  // Restore CREATE TABLE statements
  if (schema_sql) {
    const statements = (schema_sql as string).split(";\n").filter(Boolean);
    for (const stmt of statements) {
      try {
        await websiteDb.query(stmt);
      } catch {
        console.error("Failed to restore table:", stmt.slice(0, 100));
      }
    }
  }

  // Restore schema registry entries
  if (table_definitions && Array.isArray(table_definitions)) {
    for (const def of table_definitions as Array<Record<string, unknown>>) {
      await websiteDb`
        INSERT INTO _schema_registry (table_name, display_name, description, category, template_id, columns, indexes)
        VALUES (
          ${def.table_name as string}, ${def.display_name as string}, ${(def.description as string) || null},
          ${(def.category as string) || 'custom'}, ${(def.template_id as string) || null},
          ${JSON.stringify(def.columns || [])}::jsonb, ${JSON.stringify(def.indexes || [])}::jsonb
        )
        ON CONFLICT (table_name) DO NOTHING
      `;
    }
  }

  // Clean up backup
  await db`DELETE FROM saved_website_schemas WHERE project_id = ${projectId}`;
}

// ── Hibernate website DB (on cancel / payment failure) ─────────────

export async function hibernateWebsiteDb(projectId: string): Promise<void> {
  const db = getDb();
  const rows = await db`
    SELECT neon_connection_url FROM projects WHERE id = ${projectId} LIMIT 1
  `;
  if (rows.length === 0 || !rows[0].neon_connection_url) return;

  const connectionUrl = rows[0].neon_connection_url as string;
  const websiteDb = neon(connectionUrl);

  // Save schema registry
  let tableDefinitions: unknown[] = [];
  let schemaSql = "";
  try {
    const registryRows = await websiteDb`SELECT * FROM _schema_registry`;
    tableDefinitions = registryRows;

    // Generate CREATE TABLE statements for custom tables
    const customTables = registryRows.map((r) => r.table_name as string);
    const createStatements: string[] = [];
    for (const tableName of customTables) {
      const result = await websiteDb.query(
        `SELECT 'CREATE TABLE IF NOT EXISTS ' || quote_ident($1) || ' (' ||
          string_agg(
            quote_ident(column_name) || ' ' || data_type ||
            CASE WHEN character_maximum_length IS NOT NULL
              THEN '(' || character_maximum_length || ')'
              ELSE ''
            END ||
            CASE WHEN column_default IS NOT NULL
              THEN ' DEFAULT ' || column_default
              ELSE ''
            END ||
            CASE WHEN is_nullable = 'NO'
              THEN ' NOT NULL'
              ELSE ''
            END,
            ', '
          ) || ')' AS create_stmt
        FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'
        GROUP BY table_name`,
        [tableName]
      );
      if (result[0]?.create_stmt) {
        createStatements.push(result[0].create_stmt as string);
      }
    }
    schemaSql = createStatements.join(";\n");
  } catch {
    // DB may already be inaccessible
  }

  // Save to platform DB
  await db`
    INSERT INTO saved_website_schemas (project_id, schema_sql, table_definitions)
    VALUES (${projectId}, ${schemaSql}, ${JSON.stringify(tableDefinitions)}::jsonb)
    ON CONFLICT (project_id) DO UPDATE
    SET schema_sql = EXCLUDED.schema_sql,
        table_definitions = EXCLUDED.table_definitions,
        saved_at = NOW()
  `;

  // Check if project has task credits — if so, don't set expiry
  // (usage-billing cron will deduct credits monthly to keep DB alive)
  const creditRows = await db`
    SELECT task_credits FROM projects WHERE id = ${projectId} LIMIT 1
  `;
  const credits = Number(creditRows[0]?.task_credits) || 0;

  if (credits > 0) {
    // Has credits — DB will be kept alive via credit deductions, no expiry needed
    return;
  }

  // No credits and no subscription — start 2-month deletion countdown
  await db`
    UPDATE projects
    SET website_db_expires_at = NOW() + INTERVAL '2 months',
        last_deletion_warning_at = NOW()
    WHERE id = ${projectId}
  `;
}

// ── Restore website DB (on re-subscribe / payment fix) ─────────────

export async function restoreWebsiteDb(projectId: string, slug: string): Promise<void> {
  // Provision new Neon project (also restores custom tables from backup)
  await provisionWebsiteDb(projectId, slug);

  // Clear expiry state
  const db = getDb();
  await db`
    UPDATE projects
    SET website_db_expires_at = NULL,
        last_deletion_warning_at = NULL
    WHERE id = ${projectId}
  `;
}

// ── Delete expired website DBs (called by cron) ────────────────────

export async function deleteExpiredWebsiteDbs(): Promise<{ deleted: string[] }> {
  const db = getDb();
  const expired = await db`
    SELECT id, neon_project_id, slug FROM projects
    WHERE website_db_expires_at IS NOT NULL
      AND website_db_expires_at < NOW()
      AND neon_project_id IS NOT NULL
  `;

  const deleted: string[] = [];
  for (const project of expired) {
    try {
      await deleteNeonProject(project.neon_project_id as string);
      await db`
        UPDATE projects
        SET neon_project_id = NULL,
            neon_connection_url = NULL,
            website_db_expires_at = NULL,
            last_deletion_warning_at = NULL,
            website_db_storage_bytes = 0,
            website_db_overage_credits = 0
        WHERE id = ${project.id}
      `;
      deleted.push(project.slug as string);
    } catch (error) {
      console.error(`Failed to delete Neon project for ${project.slug}:`, error);
    }
  }

  return { deleted };
}

// ── Delete a Neon project ──────────────────────────────────────────

export async function deleteNeonProject(neonProjectId: string) {
  if (!neonProjectId) return;
  const apiKey = process.env.NEON_API_KEY;
  if (!apiKey) return;

  const res = await fetch(`${NEON_API_BASE}/projects/${neonProjectId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Failed to delete Neon project: ${body}`);
  }
}

// ── Get storage usage (calls Neon API) ─────────────────────────────

export async function getWebsiteDbStorageBytes(projectId: string): Promise<number> {
  const db = getDb();
  const rows = await db`
    SELECT neon_project_id FROM projects WHERE id = ${projectId} LIMIT 1
  `;
  if (rows.length === 0 || !rows[0].neon_project_id) return 0;

  const neonProjectId = rows[0].neon_project_id as string;
  const apiKey = process.env.NEON_API_KEY;
  if (!apiKey) return 0;

  try {
    const res = await fetch(`${NEON_API_BASE}/projects/${neonProjectId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return 0;

    const data = await res.json();
    const bytes = data.project?.store_usage ?? 0;

    // Update cached value
    await db`
      UPDATE projects SET website_db_storage_bytes = ${bytes} WHERE id = ${projectId}
    `;

    return bytes;
  } catch {
    return 0;
  }
}
