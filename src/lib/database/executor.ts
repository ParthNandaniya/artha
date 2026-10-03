import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { SchemaOperation, ColumnDefinition, IndexDefinition } from "./types";
import {
  validateTableName,
  validateColumnName,
  validateColumnType,
  MAX_CUSTOM_TABLES,
  MAX_COLUMNS_PER_TABLE,
  WEBSITE_SYSTEM_TABLES,
} from "./constants";

type WebsiteDb = NeonQueryFunction<false, false>;

function escapeIdentifier(name: string): string {
  // Double-quote and escape any existing double-quotes
  return `"${name.replace(/"/g, '""')}"`;
}

function buildColumnDef(col: ColumnDefinition): string {
  const parts = [escapeIdentifier(col.name), col.type.toUpperCase()];
  if (col.primary_key) parts.push("PRIMARY KEY");
  if (col.unique) parts.push("UNIQUE");
  if (!col.nullable && !col.primary_key) parts.push("NOT NULL");
  if (col.default_value !== undefined) {
    // Only allow safe default expressions
    const safe = /^(?:'[^']*'|[0-9.]+|TRUE|FALSE|NOW\(\)|uuid_generate_v4\(\)|'\{\}'::jsonb|'\[\]'::jsonb|NULL)$/i;
    if (safe.test(col.default_value)) {
      parts.push(`DEFAULT ${col.default_value}`);
    }
  }
  if (col.references) {
    const refTable = escapeIdentifier(col.references.table);
    const refCol = escapeIdentifier(col.references.column);
    parts.push(`REFERENCES ${refTable}(${refCol}) ON DELETE SET NULL`);
  }
  return parts.join(" ");
}

export async function executeSchemaOperations(
  websiteDb: WebsiteDb,
  operations: SchemaOperation[]
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  for (const op of operations) {
    try {
      switch (op.operation) {
        case "create_table":
          await executeCreateTable(websiteDb, op, errors);
          break;
        case "alter_table":
          await executeAlterTable(websiteDb, op, errors);
          break;
        case "drop_table":
          await executeDropTable(websiteDb, op, errors);
          break;
        default:
          errors.push(`Unknown operation: ${op.operation}`);
      }
    } catch (error) {
      errors.push(`${op.operation} ${op.table}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { success: errors.length === 0, errors };
}

async function executeCreateTable(
  websiteDb: WebsiteDb,
  op: SchemaOperation,
  errors: string[]
): Promise<void> {
  // Validate table name
  const nameError = validateTableName(op.table);
  if (nameError) { errors.push(nameError); return; }

  // Check table limit
  const countResult = await websiteDb`SELECT COUNT(*)::int AS cnt FROM _schema_registry`;
  if ((countResult[0]?.cnt as number) >= MAX_CUSTOM_TABLES) {
    errors.push(`Maximum of ${MAX_CUSTOM_TABLES} custom tables reached`);
    return;
  }

  // Validate columns
  const columns = op.columns || [];
  if (columns.length > MAX_COLUMNS_PER_TABLE) {
    errors.push(`Maximum of ${MAX_COLUMNS_PER_TABLE} columns per table`);
    return;
  }

  for (const col of columns) {
    const colError = validateColumnName(col.name);
    if (colError) { errors.push(colError); return; }
    if (!validateColumnType(col.type)) {
      errors.push(`Invalid column type "${col.type}" for column "${col.name}"`);
      return;
    }
  }

  // Build CREATE TABLE statement
  const tableName = escapeIdentifier(op.table);
  const colDefs = [
    `"id" UUID PRIMARY KEY DEFAULT uuid_generate_v4()`,
    ...columns.map(buildColumnDef),
    `"created_at" TIMESTAMPTZ DEFAULT NOW()`,
    `"updated_at" TIMESTAMPTZ DEFAULT NOW()`,
  ];

  await websiteDb.query(`CREATE TABLE IF NOT EXISTS ${tableName} (${colDefs.join(", ")})`);

  // Create indexes
  if (op.indexes?.length) {
    for (const idx of op.indexes) {
      await createIndex(websiteDb, op.table, idx);
    }
  }

  // Register in schema registry
  await websiteDb`
    INSERT INTO _schema_registry (table_name, display_name, description, category, template_id, columns, indexes)
    VALUES (
      ${op.table},
      ${op.display_name || op.table.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())},
      ${op.description || null},
      'custom',
      ${op.template_id || null},
      ${JSON.stringify(columns)}::jsonb,
      ${JSON.stringify(op.indexes || [])}::jsonb
    )
    ON CONFLICT (table_name) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        description = EXCLUDED.description,
        columns = EXCLUDED.columns,
        indexes = EXCLUDED.indexes,
        updated_at = NOW()
  `;

  // Insert seed data
  if (op.seed_data?.length) {
    for (const row of op.seed_data) {
      const keys = Object.keys(row).filter((k) => k !== "id");
      if (keys.length === 0) continue;

      const cols = keys.map(escapeIdentifier).join(", ");
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
      const values = keys.map((k) => {
        const v = row[k];
        return typeof v === "object" && v !== null ? JSON.stringify(v) : v;
      });

      await websiteDb.query(
        `INSERT INTO ${tableName} (${cols}) VALUES (${placeholders})`,
        values as (string | number | boolean | null)[]
      );
    }
  }
}

async function executeAlterTable(
  websiteDb: WebsiteDb,
  op: SchemaOperation,
  errors: string[]
): Promise<void> {
  const nameError = validateTableName(op.table);
  if (nameError) { errors.push(nameError); return; }

  // Cannot alter system tables
  if ((WEBSITE_SYSTEM_TABLES as readonly string[]).includes(op.table)) {
    errors.push(`Cannot alter system table "${op.table}"`);
    return;
  }

  const tableName = escapeIdentifier(op.table);

  // Add columns
  if (op.add_columns?.length) {
    for (const col of op.add_columns) {
      const colError = validateColumnName(col.name);
      if (colError) { errors.push(colError); continue; }
      if (!validateColumnType(col.type)) {
        errors.push(`Invalid column type "${col.type}"`);
        continue;
      }
      const def = buildColumnDef(col);
      await websiteDb.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${def}`);
    }
  }

  // Drop columns
  if (op.drop_columns?.length) {
    for (const colName of op.drop_columns) {
      if (colName === "id" || colName === "created_at" || colName === "updated_at") {
        errors.push(`Cannot drop system column "${colName}"`);
        continue;
      }
      await websiteDb.query(`ALTER TABLE ${tableName} DROP COLUMN IF EXISTS ${escapeIdentifier(colName)}`);
    }
  }

  // Update registry
  const registryRows = await websiteDb`
    SELECT columns FROM _schema_registry WHERE table_name = ${op.table}
  `;
  if (registryRows.length > 0) {
    let columns = (registryRows[0].columns || []) as { name: string; type: string }[];
    if (op.add_columns) columns = [...columns, ...op.add_columns];
    if (op.drop_columns) columns = columns.filter((c) => !op.drop_columns!.includes(c.name));
    await websiteDb`
      UPDATE _schema_registry SET columns = ${JSON.stringify(columns)}::jsonb, updated_at = NOW()
      WHERE table_name = ${op.table}
    `;
  }
}

async function executeDropTable(
  websiteDb: WebsiteDb,
  op: SchemaOperation,
  errors: string[]
): Promise<void> {
  if ((WEBSITE_SYSTEM_TABLES as readonly string[]).includes(op.table)) {
    errors.push(`Cannot drop system table "${op.table}"`);
    return;
  }

  const tableName = escapeIdentifier(op.table);
  await websiteDb.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
  await websiteDb`DELETE FROM _schema_registry WHERE table_name = ${op.table}`;
}

async function createIndex(
  websiteDb: WebsiteDb,
  tableName: string,
  idx: IndexDefinition
): Promise<void> {
  const unique = idx.unique ? "UNIQUE " : "";
  const idxName = escapeIdentifier(idx.name || `idx_${tableName}_${idx.columns.join("_")}`);
  const cols = idx.columns.map(escapeIdentifier).join(", ");
  await websiteDb.query(`CREATE ${unique}INDEX IF NOT EXISTS ${idxName} ON ${escapeIdentifier(tableName)} (${cols})`);
}
