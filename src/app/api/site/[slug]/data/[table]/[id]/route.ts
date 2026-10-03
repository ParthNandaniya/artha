import { NextRequest } from "next/server";
import { handlePreflight, createRateLimiter, getClientIp, getProjectBySlug, getWebsiteDb, requireSiteUser, isErrorResponse, jsonResponse } from "@/lib/site-api";
import { WEBSITE_SYSTEM_TABLES } from "@/lib/database/constants";

const isRateLimited = createRateLimiter(30);

const SYSTEM_COLUMNS = new Set(["id", "created_at", "updated_at", "site_user_id"]);

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request);
}

// ── Shared setup ──────────────────────────────────────────────────────

async function setup(
  request: NextRequest,
  params: Promise<{ slug: string; table: string; id: string }>
) {
  const { slug, table, id } = await params;
  const origin = request.headers.get("origin");

  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return { error: jsonResponse({ error: "Too many requests" }, 429, origin) };
  }

  const project = await getProjectBySlug(slug);
  if (!project) return { error: jsonResponse({ error: "Not found" }, 404, origin) };

  const websiteDb = await getWebsiteDb(slug);
  if (!websiteDb) return { error: jsonResponse({ error: "Database not available" }, 403, origin) };

  const userOrError = await requireSiteUser(request, websiteDb, origin);
  if (isErrorResponse(userOrError)) return { error: userOrError };

  if ((WEBSITE_SYSTEM_TABLES as readonly string[]).includes(table)) {
    return { error: jsonResponse({ error: "Access denied" }, 403, origin) };
  }

  const registry = await websiteDb`
    SELECT columns FROM _schema_registry WHERE table_name = ${table} LIMIT 1
  `;
  if (registry.length === 0) {
    return { error: jsonResponse({ error: "Table not found" }, 404, origin) };
  }

  const columns = (registry[0].columns || []) as Array<{ name: string }>;
  const hasUserScope = columns.some((c) => c.name === "site_user_id");

  return { slug, table, id, origin, websiteDb, user: userOrError, columns, hasUserScope };
}

// ── GET: Get single row ───────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; table: string; id: string }> }
) {
  const ctx = await setup(request, params);
  if ("error" in ctx) return ctx.error;

  const { table, id, origin, websiteDb, user, hasUserScope } = ctx;
  const tableName = escapeIdent(table);

  const rows = hasUserScope
    ? await websiteDb.query(
        `SELECT * FROM ${tableName} WHERE id = $1 AND site_user_id = $2 LIMIT 1`,
        [id, user.id]
      )
    : await websiteDb.query(
        `SELECT * FROM ${tableName} WHERE id = $1 LIMIT 1`,
        [id]
      );

  if (rows.length === 0) {
    return jsonResponse({ error: "Row not found" }, 404, origin);
  }

  return jsonResponse({ row: rows[0] }, 200, origin);
}

// ── PATCH: Update row ─────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; table: string; id: string }> }
) {
  const ctx = await setup(request, params);
  if ("error" in ctx) return ctx.error;

  const { table, id, origin, websiteDb, user, columns, hasUserScope } = ctx;

  let body: { data?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const data = body.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return jsonResponse({ error: "data must be an object" }, 400, origin);
  }

  const columnNames = new Set(columns.map((c) => c.name));
  for (const key of Object.keys(data)) {
    if (SYSTEM_COLUMNS.has(key)) {
      return jsonResponse({ error: `Cannot update system column "${key}"` }, 400, origin);
    }
    if (!columnNames.has(key)) {
      return jsonResponse({ error: `Unknown column "${key}"` }, 400, origin);
    }
  }

  const keys = Object.keys(data);
  if (keys.length === 0) {
    return jsonResponse({ error: "No data provided" }, 400, origin);
  }

  const tableName = escapeIdent(table);
  const setClauses = keys.map((k, i) => `${escapeIdent(k)} = $${i + 1}`).join(", ");
  const values = keys.map((k) => {
    const v = data[k];
    return typeof v === "object" && v !== null ? JSON.stringify(v) : v;
  });

  // Add updated_at
  const setWithTimestamp = `${setClauses}, "updated_at" = NOW()`;

  let query: string;
  const queryValues = [...values] as (string | number | boolean | null)[];

  if (hasUserScope) {
    query = `UPDATE ${tableName} SET ${setWithTimestamp} WHERE id = $${keys.length + 1} AND site_user_id = $${keys.length + 2} RETURNING *`;
    queryValues.push(id, user.id);
  } else {
    query = `UPDATE ${tableName} SET ${setWithTimestamp} WHERE id = $${keys.length + 1} RETURNING *`;
    queryValues.push(id);
  }

  const rows = await websiteDb.query(query, queryValues);
  if (rows.length === 0) {
    return jsonResponse({ error: "Row not found" }, 404, origin);
  }

  return jsonResponse({ row: rows[0] }, 200, origin);
}

// ── DELETE: Delete row ────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; table: string; id: string }> }
) {
  const ctx = await setup(request, params);
  if ("error" in ctx) return ctx.error;

  const { table, id, origin, websiteDb, user, hasUserScope } = ctx;
  const tableName = escapeIdent(table);

  const rows = hasUserScope
    ? await websiteDb.query(
        `DELETE FROM ${tableName} WHERE id = $1 AND site_user_id = $2 RETURNING id`,
        [id, user.id]
      )
    : await websiteDb.query(
        `DELETE FROM ${tableName} WHERE id = $1 RETURNING id`,
        [id]
      );

  if (rows.length === 0) {
    return jsonResponse({ error: "Row not found" }, 404, origin);
  }

  return jsonResponse({ ok: true }, 200, origin);
}

// ── Helpers ───────────────────────────────────────────────────────────

function escapeIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
