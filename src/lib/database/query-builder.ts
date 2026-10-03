import type { NeonQueryFunction } from "@neondatabase/serverless";

type DbClient = NeonQueryFunction<false, false>;

function escapeIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

// ── SELECT ─────────────────────────────────────────────────────────

export async function queryTableRows(
  db: DbClient,
  tableName: string,
  options: {
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortDir?: "asc" | "desc";
    search?: string;
    searchColumns?: string[];
  } = {}
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const { page = 1, pageSize = 50, sortBy = "created_at", sortDir = "desc", search, searchColumns } = options;
  const offset = (page - 1) * pageSize;
  const table = escapeIdentifier(tableName);
  const orderCol = escapeIdentifier(sortBy);

  let whereClause = "";
  const params: (string | number)[] = [];

  if (search && searchColumns?.length) {
    const conditions = searchColumns.map((col, i) => {
      params.push(`%${search}%`);
      return `${escapeIdentifier(col)}::text ILIKE $${i + 1}`;
    });
    whereClause = `WHERE ${conditions.join(" OR ")}`;
  }

  const countQuery = `SELECT COUNT(*)::int AS total FROM ${table} ${whereClause}`;
  const countResult = await db.query(countQuery, params);
  const total = (countResult[0]?.total as number) || 0;

  const dataParams = [...params, pageSize, offset];
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;
  const dataQuery = `SELECT * FROM ${table} ${whereClause} ORDER BY ${orderCol} ${sortDir === "asc" ? "ASC" : "DESC"} LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
  const rows = await db.query(dataQuery, dataParams);

  return { rows: rows as Record<string, unknown>[], total };
}

// ── INSERT ─────────────────────────────────────────────────────────

export async function insertRow(
  db: DbClient,
  tableName: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const keys = Object.keys(data).filter((k) => k !== "id" && k !== "created_at" && k !== "updated_at");
  if (keys.length === 0) throw new Error("No data provided");

  const table = escapeIdentifier(tableName);
  const cols = keys.map(escapeIdentifier).join(", ");
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  const values = keys.map((k) => {
    const v = data[k];
    return typeof v === "object" && v !== null ? JSON.stringify(v) : v;
  });

  const result = await db.query(
    `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) RETURNING *`,
    values as (string | number | boolean | null)[]
  );
  return result[0] as Record<string, unknown>;
}

// ── UPDATE ─────────────────────────────────────────────────────────

export async function updateRow(
  db: DbClient,
  tableName: string,
  rowId: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const keys = Object.keys(data).filter((k) => k !== "id" && k !== "created_at");
  if (keys.length === 0) throw new Error("No data provided");

  const table = escapeIdentifier(tableName);
  const setClauses = keys.map((k, i) => `${escapeIdentifier(k)} = $${i + 1}`);
  setClauses.push(`"updated_at" = NOW()`);

  const values = keys.map((k) => {
    const v = data[k];
    return typeof v === "object" && v !== null ? JSON.stringify(v) : v;
  });
  values.push(rowId);

  const result = await db.query(
    `UPDATE ${table} SET ${setClauses.join(", ")} WHERE id = $${values.length} RETURNING *`,
    values as (string | number | boolean | null)[]
  );
  if (result.length === 0) throw new Error("Row not found");
  return result[0] as Record<string, unknown>;
}

// ── DELETE ─────────────────────────────────────────────────────────

export async function deleteRow(
  db: DbClient,
  tableName: string,
  rowId: string
): Promise<void> {
  const table = escapeIdentifier(tableName);
  const result = await db.query(`DELETE FROM ${table} WHERE id = $1`, [rowId]);
  if (result.length === 0) {
    // Check via count since DELETE doesn't always return rows
    const check = await db.query(`SELECT COUNT(*) FROM ${table} WHERE id = $1`, [rowId]);
    if ((check[0]?.count as number) > 0) throw new Error("Failed to delete row");
  }
}

// ── Get table schema from information_schema ───────────────────────

export async function getTableColumns(
  db: DbClient,
  tableName: string
): Promise<{ name: string; type: string; nullable: boolean; default_value: string | null }[]> {
  const rows = await db.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_name = $1 AND table_schema = 'public'
     ORDER BY ordinal_position`,
    [tableName]
  );

  return (rows as Array<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>).map((r) => ({
    name: r.column_name,
    type: r.data_type,
    nullable: r.is_nullable === "YES",
    default_value: r.column_default,
  }));
}
