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

  const plans = await db`
    SELECT * FROM project_pricing_plans
    WHERE project_id = ${projectId}
    ORDER BY sort_order ASC, created_at ASC
  `;

  return NextResponse.json(plans);
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, name, amount_cents, billing_interval, features } = body;

  if (!projectId || !name || amount_cents == null || !billing_interval) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!["month", "year", "one_time"].includes(billing_interval)) {
    return NextResponse.json({ error: "Invalid billing interval" }, { status: 400 });
  }

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const publicId = `plan_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

  const rows = await db`
    INSERT INTO project_pricing_plans (project_id, public_id, slug, name, amount_cents, billing_interval, features)
    VALUES (
      ${projectId},
      ${publicId},
      ${slug},
      ${name},
      ${amount_cents},
      ${billing_interval},
      ${JSON.stringify(features || [])}::jsonb
    )
    RETURNING *
  `;

  return NextResponse.json(rows[0], { status: 201 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const planId = searchParams.get("planId");
  const projectId = searchParams.get("projectId");

  if (!planId || !projectId) {
    return NextResponse.json({ error: "Missing planId or projectId" }, { status: 400 });
  }

  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deleted = await db`
    DELETE FROM project_pricing_plans
    WHERE id = ${planId} AND project_id = ${projectId}
    RETURNING id
  `;

  if (deleted.length === 0) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}
