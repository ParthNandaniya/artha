import { NextRequest } from "next/server";
import { handlePreflight, createRateLimiter, getClientIp, getProjectBySlug, getWebsiteDb, requireSiteUser, isErrorResponse, jsonResponse } from "@/lib/site-api";
import { WEBSITE_SYSTEM_TABLES } from "@/lib/database/constants";

const isRateLimited = createRateLimiter(30);

const SYSTEM_COLUMNS = new Set(["id", "created_at", "updated_at"]);
const MAX_LIMIT = 100;

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request);
}

// ── GET: List rows ────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; table: string }> }
) {
  const { slug, table } = await params;
  const origin = request.headers.get("origin");

  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return jsonResponse({ error: "Too many requests" }, 429, origin);
  }

  const project = await getProjectBySlug(slug);
  if (!project) return jsonResponse({ error: "Not found" }, 404, origin);

  const websiteDb = await getWebsiteDb(slug);
  if (!websiteDb) return jsonResponse({ error: "Database not available" }, 403, origin);

  const userOrError = await requireSiteUser(request, websiteDb, origin);
  if (isErrorResponse(userOrError)) return userOrError;

  // Validate table
  if ((WEBSITE_SYSTEM_TABLES as readonly string[]).includes(table)) {
    return jsonResponse({ error: "Access denied" }, 403, origin);
  }

  const registry = await websiteDb`
    SELECT columns FROM _schema_registry WHERE table_name = ${table} LIMIT 1
  `;
  if (registry.length === 0) {
    return jsonResponse({ error: "Table not found" }, 404, origin);
  }

  // Check if table has site_user_id column for auto-scoping
  const columns = (registry[0].columns || []) as Array<{ name: string }>;
  const hasUserScope = columns.some((c) => c.name === "site_user_id");

  // Parse query params
  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1),
    MAX_LIMIT
  );
  const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);
  const sort = searchParams.get("sort") || "created_at";
  const order = searchParams.get("order") === "asc" ? "ASC" : "DESC";

  // Validate sort column exists
  const allColumns = ["id", "created_at", "updated_at", ...columns.map((c) => c.name)];
  if (!allColumns.includes(sort)) {
    return jsonResponse({ error: `Invalid sort column: ${sort}` }, 400, origin);
  }

  // Build and execute query
  const tableName = escapeIdent(table);
  const sortCol = escapeIdent(sort);

  if (hasUserScope) {
    const countResult = await websiteDb.query(
      `SELECT COUNT(*)::int AS total FROM ${tableName} WHERE site_user_id = $1`,
      [userOrError.id]
    );
    const rows = await websiteDb.query(
      `SELECT * FROM ${tableName} WHERE site_user_id = $1 ORDER BY ${sortCol} ${order} LIMIT $2 OFFSET $3`,
      [userOrError.id, limit, offset]
    );
    return jsonResponse({ rows, total: countResult[0]?.total || 0 }, 200, origin);
  } else {
    const countResult = await websiteDb.query(
      `SELECT COUNT(*)::int AS total FROM ${tableName}`
    );
    const rows = await websiteDb.query(
      `SELECT * FROM ${tableName} ORDER BY ${sortCol} ${order} LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return jsonResponse({ rows, total: countResult[0]?.total || 0 }, 200, origin);
  }
}

// ── POST: Insert row ──────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; table: string }> }
) {
  const { slug, table } = await params;
  const origin = request.headers.get("origin");

  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return jsonResponse({ error: "Too many requests" }, 429, origin);
  }

  const project = await getProjectBySlug(slug);
  if (!project) return jsonResponse({ error: "Not found" }, 404, origin);

  const websiteDb = await getWebsiteDb(slug);
  if (!websiteDb) return jsonResponse({ error: "Database not available" }, 403, origin);

  const userOrError = await requireSiteUser(request, websiteDb, origin);
  if (isErrorResponse(userOrError)) return userOrError;

  // Validate table
  if ((WEBSITE_SYSTEM_TABLES as readonly string[]).includes(table)) {
    return jsonResponse({ error: "Access denied" }, 403, origin);
  }

  const registry = await websiteDb`
    SELECT columns FROM _schema_registry WHERE table_name = ${table} LIMIT 1
  `;
  if (registry.length === 0) {
    return jsonResponse({ error: "Table not found" }, 404, origin);
  }

  let body: { data?: Record<string, unknown>; creditCost?: number };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const data = body.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return jsonResponse({ error: "data must be an object" }, 400, origin);
  }

  const columns = (registry[0].columns || []) as Array<{ name: string }>;
  const columnNames = new Set(columns.map((c) => c.name));
  const hasUserScope = columns.some((c) => c.name === "site_user_id");

  // Validate provided columns
  for (const key of Object.keys(data)) {
    if (SYSTEM_COLUMNS.has(key)) {
      return jsonResponse({ error: `Cannot set system column "${key}"` }, 400, origin);
    }
    if (key !== "site_user_id" && !columnNames.has(key)) {
      return jsonResponse({ error: `Unknown column "${key}"` }, 400, origin);
    }
  }

  // Auto-set site_user_id if table has it
  if (hasUserScope) {
    data.site_user_id = userOrError.id;
  }

  const creditCost = body.creditCost;

  // Build insert
  const keys = Object.keys(data);
  if (keys.length === 0) {
    return jsonResponse({ error: "No data provided" }, 400, origin);
  }

  const tableName = escapeIdent(table);
  const cols = keys.map(escapeIdent).join(", ");
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  const values = keys.map((k) => {
    const v = data[k];
    return typeof v === "object" && v !== null ? JSON.stringify(v) : v;
  });

  // If creditCost specified, do atomic deduction + insert
  if (creditCost && creditCost > 0) {
    // Atomic credit deduction
    const deductResult = await websiteDb.query(
      `UPDATE site_users SET credits = credits - $1 WHERE id = $2 AND credits >= $1 RETURNING credits`,
      [creditCost, userOrError.id]
    );

    if (deductResult.length === 0) {
      // Insufficient credits — get current balance for error message
      const balanceResult = await websiteDb`
        SELECT credits FROM site_users WHERE id = ${userOrError.id}
      `;
      const currentBalance = Number(balanceResult[0]?.credits) || 0;
      return jsonResponse(
        { error: "Insufficient credits", balance: currentBalance },
        402,
        origin
      );
    }

    const newBalance = Number(deductResult[0].credits);

    // Insert row
    const rowResult = await websiteDb.query(
      `INSERT INTO ${tableName} (${cols}) VALUES (${placeholders}) RETURNING *`,
      values as (string | number | boolean | null)[]
    );

    // Log credit transaction
    await websiteDb`
      INSERT INTO credit_transactions (site_user_id, amount, type, reason, reference_id, balance_after)
      VALUES (${userOrError.id}, ${-creditCost}, 'deduction', ${`insert into ${table}`}, ${rowResult[0]?.id || null}, ${newBalance})
    `;

    return jsonResponse({ row: rowResult[0], credits: newBalance }, 201, origin);
  }

  // No credit cost — simple insert
  const rowResult = await websiteDb.query(
    `INSERT INTO ${tableName} (${cols}) VALUES (${placeholders}) RETURNING *`,
    values as (string | number | boolean | null)[]
  );

  return jsonResponse({ row: rowResult[0] }, 201, origin);
}

// ── Helpers ───────────────────────────────────────────────────────────

function escapeIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
