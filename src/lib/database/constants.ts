// Website DB system tables (in isolated Neon DB, subscription-required)
export const WEBSITE_SYSTEM_TABLES = [
  "site_config",
  "site_users",
  "site_payments",
  "site_sessions",
  "credit_transactions",
  "_schema_registry",
] as const;

// Platform DB free tables (always available, scoped by project_id)
export const FREE_DATA_TABLES = [
  "contacts",
  "forms",
  "form_submissions",
] as const;

// Allowed PostgreSQL column types for custom tables
export const ALLOWED_COLUMN_TYPES = [
  "TEXT",
  "INTEGER",
  "BIGINT",
  "NUMERIC",
  "BOOLEAN",
  "TIMESTAMPTZ",
  "UUID",
  "JSONB",
  "TEXT[]",
] as const;

// Limits
export const MAX_CUSTOM_TABLES = 30;
export const MAX_COLUMNS_PER_TABLE = 25;
export const MAX_TABLE_NAME_LENGTH = 63;
export const MAX_COLUMN_NAME_LENGTH = 63;

// Storage limits (in bytes)
export const FREE_STORAGE_BYTES = 104_857_600; // 100MB (database)
export const OVERAGE_CREDITS_PER_100MB = 0.5;

// File storage (R2)
export const FREE_FILE_STORAGE_BYTES = 209_715_200; // 200MB
export const FILE_STORAGE_CREDITS_PER_200MB = 1; // 1 credit/month per 200MB

// Monthly cost to keep a website DB alive without subscription
export const MONTHLY_DB_KEEP_ALIVE_CREDITS = 0.5;

// Valid table name pattern: lowercase letters, numbers, underscores only
const TABLE_NAME_REGEX = /^[a-z][a-z0-9_]*$/;

// Reserved table names that cannot be used for custom tables
const RESERVED_NAMES = new Set([
  ...WEBSITE_SYSTEM_TABLES,
  "pg_catalog",
  "information_schema",
  "public",
]);

export function validateTableName(name: string): string | null {
  if (!name || name.length === 0) return "Table name is required";
  if (name.length > MAX_TABLE_NAME_LENGTH) return `Table name exceeds ${MAX_TABLE_NAME_LENGTH} characters`;
  if (!TABLE_NAME_REGEX.test(name)) return "Table name must start with a letter and contain only lowercase letters, numbers, and underscores";
  if (RESERVED_NAMES.has(name)) return `"${name}" is a reserved table name`;
  if (name.startsWith("pg_") || name.startsWith("sql_")) return "Table names cannot start with pg_ or sql_";
  return null;
}

export function validateColumnName(name: string): string | null {
  if (!name || name.length === 0) return "Column name is required";
  if (name.length > MAX_COLUMN_NAME_LENGTH) return `Column name exceeds ${MAX_COLUMN_NAME_LENGTH} characters`;
  if (!TABLE_NAME_REGEX.test(name)) return "Column name must start with a letter and contain only lowercase letters, numbers, and underscores";
  if (name === "id" || name === "created_at" || name === "updated_at") return `"${name}" is automatically added`;
  return null;
}

export function validateColumnType(type: string): boolean {
  return ALLOWED_COLUMN_TYPES.includes(type.toUpperCase() as typeof ALLOWED_COLUMN_TYPES[number]);
}
