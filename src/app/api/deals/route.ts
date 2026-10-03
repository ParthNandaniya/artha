import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";

// ── Helpers ──────────────────────────────────────────────────────────

async function verifyProjectOwnership(projectId: string, userId: string) {
  const db = getDb();
  const rows = await db`
    SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${userId} LIMIT 1
  `;
  return rows.length > 0;
}

// ── GET: List deals for a project ────────────────────────────────────

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  if (!(await verifyProjectOwnership(projectId, user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const db = getDb();

  try {
    const deals = await db`
      SELECT
        d.*,
        s.name AS stage_name,
        s.color AS stage_color,
        s.sort_order AS stage_sort_order,
        l.name AS lead_name,
        l.email AS lead_email,
        l.company AS lead_company
      FROM deals d
      LEFT JOIN deal_pipeline_stages s ON d.stage_id = s.id
      LEFT JOIN leads l ON d.lead_id = l.id
      WHERE d.project_id = ${projectId}
      ORDER BY s.sort_order ASC, d.created_at DESC
    `;
    return NextResponse.json(deals);
  } catch {
    return NextResponse.json([]);
  }
}

// ── POST: Create a new deal ──────────────────────────────────────────

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, title, value_cents, stage_id, lead_id, notes, probability, expected_close_date } = body;

  if (!projectId || !title) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!(await verifyProjectOwnership(projectId, user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const db = getDb();

  try {
    const rows = await db`
      INSERT INTO deals (project_id, title, value_cents, stage_id, lead_id, notes, probability, expected_close_date)
      VALUES (
        ${projectId},
        ${title},
        ${value_cents ?? 0},
        ${stage_id ?? null},
        ${lead_id ?? null},
        ${notes ?? null},
        ${probability ?? 50},
        ${expected_close_date ?? null}
      )
      RETURNING *
    `;

    const deal = rows[0];

    // Log creation activity
    await db`
      INSERT INTO deal_activities (deal_id, type, content, metadata)
      VALUES (${deal.id}, 'created', ${'Deal created'}, ${JSON.stringify({ title, value_cents: value_cents ?? 0 })}::jsonb)
    `;

    return NextResponse.json(deal, { status: 201 });
  } catch (err) {
    console.error("Failed to create deal:", err);
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
  }
}

// ── PATCH: Update a deal ─────────────────────────────────────────────

export async function PATCH(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, dealId, ...updates } = body;

  if (!projectId || !dealId) {
    return NextResponse.json({ error: "Missing projectId or dealId" }, { status: 400 });
  }

  if (!(await verifyProjectOwnership(projectId, user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const db = getDb();

  // Fetch current deal for activity logging
  const currentRows = await db`
    SELECT * FROM deals WHERE id = ${dealId} AND project_id = ${projectId} LIMIT 1
  `;
  if (currentRows.length === 0) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }
  const current = currentRows[0];

  try {
    const rows = await db`
      UPDATE deals SET
        title = COALESCE(${updates.title ?? null}, title),
        value_cents = COALESCE(${updates.value_cents ?? null}, value_cents),
        stage_id = COALESCE(${updates.stage_id ?? null}, stage_id),
        lead_id = COALESCE(${updates.lead_id ?? null}, lead_id),
        notes = COALESCE(${updates.notes ?? null}, notes),
        probability = COALESCE(${updates.probability ?? null}, probability),
        expected_close_date = COALESCE(${updates.expected_close_date ?? null}, expected_close_date),
        won_at = COALESCE(${updates.won_at ?? null}, won_at),
        lost_at = COALESCE(${updates.lost_at ?? null}, lost_at),
        lost_reason = COALESCE(${updates.lost_reason ?? null}, lost_reason),
        updated_at = NOW()
      WHERE id = ${dealId} AND project_id = ${projectId}
      RETURNING *
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Log stage change activity
    if (updates.stage_id && updates.stage_id !== current.stage_id) {
      const stages = await db`
        SELECT id, name FROM deal_pipeline_stages
        WHERE id IN (${current.stage_id}, ${updates.stage_id})
      `;
      const stageMap = new Map(stages.map((s) => [s.id, s.name]));

      await db`
        INSERT INTO deal_activities (deal_id, type, content, metadata)
        VALUES (
          ${dealId},
          'stage_change',
          ${`Moved from ${stageMap.get(current.stage_id) || 'unknown'} to ${stageMap.get(updates.stage_id) || 'unknown'}`},
          ${JSON.stringify({
            from_stage_id: current.stage_id,
            to_stage_id: updates.stage_id,
          })}::jsonb
        )
      `;
    }

    // Log note added
    if (updates.notes && updates.notes !== current.notes) {
      await db`
        INSERT INTO deal_activities (deal_id, type, content)
        VALUES (${dealId}, 'note', ${updates.notes})
      `;
    }

    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("Failed to update deal:", err);
    return NextResponse.json({ error: "Failed to update deal" }, { status: 500 });
  }
}

// ── DELETE: Remove a deal ────────────────────────────────────────────

export async function DELETE(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const dealId = searchParams.get("dealId");

  if (!projectId || !dealId) {
    return NextResponse.json({ error: "Missing projectId or dealId" }, { status: 400 });
  }

  if (!(await verifyProjectOwnership(projectId, user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const db = getDb();

  try {
    await db`
      DELETE FROM deals WHERE id = ${dealId} AND project_id = ${projectId}
    `;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete deal:", err);
    return NextResponse.json({ error: "Failed to delete deal" }, { status: 500 });
  }
}
