import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [plans, subscribers, revenueRows] = await Promise.all([
    db`
      SELECT * FROM project_pricing_plans
      WHERE project_id = ${projectId}
      ORDER BY sort_order ASC, created_at ASC
    `,
    db`
      SELECT * FROM marketplace_subscribers
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC
    `,
    db`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN gross_amount_cents END), 0)::int AS total_gross,
        COALESCE(SUM(CASE WHEN type = 'income' THEN platform_fee_cents END), 0)::int AS total_fees,
        COALESCE(SUM(CASE WHEN type = 'income' THEN seller_net_amount_cents END), 0)::int AS total_net
      FROM revenue_transactions
      WHERE project_id = ${projectId}
    `,
  ]);

  const revenue = revenueRows[0] ?? { total_gross: 0, total_fees: 0, total_net: 0 };

  return NextResponse.json({ plans, subscribers, revenue });
}

export async function PATCH(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, marketplace_enabled, marketplace_fee_percent } = body;

  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (typeof marketplace_enabled === "boolean") updates.marketplace_enabled = marketplace_enabled;
  if (typeof marketplace_fee_percent === "number") {
    if (marketplace_fee_percent < 0 || marketplace_fee_percent > 100) {
      return NextResponse.json({ error: "Fee percent must be between 0 and 100" }, { status: 400 });
    }
    updates.marketplace_fee_percent = marketplace_fee_percent;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Build dynamic update
  const rows = await db`
    UPDATE projects
    SET
      marketplace_enabled = COALESCE(${updates.marketplace_enabled ?? null}::boolean, marketplace_enabled),
      marketplace_fee_percent = COALESCE(${updates.marketplace_fee_percent ?? null}::int, marketplace_fee_percent)
    WHERE id = ${projectId} AND user_id = ${user.id}
    RETURNING marketplace_enabled, marketplace_fee_percent
  `;

  return NextResponse.json(rows[0]);
}
