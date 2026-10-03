/**
 * One-time migration: copy dashboard data from per-company isolated Neon DBs
 * into the shared platform DB (with project_id).
 *
 * Usage: npx tsx scripts/migrate-to-platform-db.ts
 *
 * Safe to re-run: uses ON CONFLICT DO NOTHING for all inserts.
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { join } from "path";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

function loadEnv() {
  for (const envFile of [".env.local", ".env"]) {
    try {
      const envPath = join(process.cwd(), envFile);
      const envContent = readFileSync(envPath, "utf-8");
      envContent.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts.join("=").trim();
          if (!process.env[key]) process.env[key] = value;
        }
      });
    } catch {
      // continue
    }
  }
}

// Tables to migrate from isolated DB → platform DB
const DASHBOARD_TABLES = [
  "company_profile",
  "documents",
  "tasks",
  "chat_messages",
  "pages",
  "memory",
  "leads",
  "research_tags",
  "email_campaigns",
  "email_sends",
  "email_inbound",
  "email_threads",
  "email_messages",
  "analytics",
  "tweets",
];

const SIMPLE_WEBSITE_TABLES = [
  "contacts",
  "forms",
  "form_submissions",
];

const ADS_TABLES = [
  "ads_settings",
  "ad_campaigns",
  "ads_campaign_creatives",
];

async function tableExists(companyPool: Pool, tableName: string): Promise<boolean> {
  const client = await companyPool.connect();
  try {
    const result = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
      [tableName]
    );
    return result.rows.length > 0;
  } finally {
    client.release();
  }
}

async function getColumnNames(companyPool: Pool, tableName: string): Promise<string[]> {
  const client = await companyPool.connect();
  try {
    const result = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [tableName]
    );
    return result.rows.map((r) => r.column_name as string);
  } finally {
    client.release();
  }
}

async function migrateTable(
  platformPool: Pool,
  companyPool: Pool,
  projectId: string,
  tableName: string
): Promise<number> {
  const exists = await tableExists(companyPool, tableName);
  if (!exists) return 0;

  const columns = await getColumnNames(companyPool, tableName);
  if (columns.length === 0) return 0;

  // Fetch all rows from isolated DB
  const companyClient = await companyPool.connect();
  let rows: Record<string, unknown>[];
  try {
    const result = await companyClient.query(`SELECT * FROM "${tableName}"`);
    rows = result.rows as Record<string, unknown>[];
  } finally {
    companyClient.release();
  }
  if (rows.length === 0) return 0;

  const platformClient = await platformPool.connect();
  let migrated = 0;
  try {
    const hasId = columns.includes("id");
    const conflictTarget =
      tableName === "memory" ? "(project_id, key)" : hasId ? "(id)" : "";

    for (const record of rows) {
      record.project_id = projectId;

      const allColumns = columns.includes("project_id")
        ? columns
        : ["project_id", ...columns];

      const values = allColumns.map((col) => {
        const val = record[col] ?? null;
        // Memory table: old DB stores values as TEXT, new DB expects JSONB.
        // Wrap plain strings so they're valid JSON.
        if (tableName === "memory" && col === "value" && typeof val === "string") {
          try {
            JSON.parse(val); // already valid JSON
            return val;
          } catch {
            return JSON.stringify(val); // wrap plain string
          }
        }
        return val;
      });
      const placeholders = allColumns.map((_, i) => `$${i + 1}`).join(", ");
      const quotedColumns = allColumns.map((c) => `"${c}"`).join(", ");

      const query = conflictTarget
        ? `INSERT INTO "${tableName}" (${quotedColumns}) VALUES (${placeholders}) ON CONFLICT ${conflictTarget} DO NOTHING`
        : `INSERT INTO "${tableName}" (${quotedColumns}) VALUES (${placeholders})`;

      try {
        await platformClient.query(query, values);
        migrated++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("duplicate key") && !msg.includes("unique constraint")) {
          console.error(`    Error inserting into ${tableName}: ${msg}`);
        }
      }
    }
  } finally {
    platformClient.release();
  }

  return migrated;
}

async function main() {
  loadEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  console.log("Connecting to platform DB...");
  const platformPool = new Pool({ connectionString: databaseUrl });

  // Get all projects with isolated DBs
  const client = await platformPool.connect();
  let projects: { id: string; slug: string; neon_connection_url: string }[];
  try {
    const result = await client.query(
      `SELECT id, slug, neon_connection_url FROM projects WHERE neon_connection_url IS NOT NULL`
    );
    projects = result.rows as typeof projects;
  } finally {
    client.release();
  }

  console.log(`Found ${projects.length} projects with isolated DBs\n`);

  for (const project of projects) {
    console.log(`--- Migrating: ${project.slug} (${project.id}) ---`);

    const companyPool = new Pool({ connectionString: project.neon_connection_url });
    const allTables = [...DASHBOARD_TABLES, ...SIMPLE_WEBSITE_TABLES, ...ADS_TABLES];
    let totalMigrated = 0;

    for (const table of allTables) {
      try {
        const count = await migrateTable(platformPool, companyPool, project.id, table);
        if (count > 0) {
          console.log(`  ${table}: ${count} rows migrated`);
          totalMigrated += count;
        }
      } catch (err) {
        console.error(`  ${table}: FAILED - ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await companyPool.end();
    console.log(`  Total: ${totalMigrated} rows\n`);
  }

  await platformPool.end();
  console.log("Migration complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
