import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";

// ── Default pipeline stages ──────────────────────────────────────────

const DEFAULT_STAGES = [
  { name: "New Lead", color: "#6366f1", sort_order: 0 },
  { name: "Contacted", color: "#3b82f6", sort_order: 1 },
  { name: "Meeting", color: "#8b5cf6", sort_order: 2 },
  { name: "Proposal", color: "#f59e0b", sort_order: 3 },
  { name: "Negotiation", color: "#f97316", sort_order: 4 },
  { name: "Won", color: "#22c55e", sort_order: 5 },
  { name: "Lost", color: "#ef4444", sort_order: 6 },
];

async function verifyProjectOwnership(projectId: string, userId: string) {
  const db = getDb();
  const rows = await db`
    SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${userId} LIMIT 1
  `;
  return rows.length > 0;
}

async function ensureDefaultStages(projectId: string) {
  const db = getDb();
  const existing = await db`
    SELECT id FROM deal_pipeline_stages WHERE project_id = ${projectId} LIMIT 1
  `;

  if (existing.length > 0) return;

  // Insert default stages
  for (const stage of DEFAULT_STAGES) {
    await db`
      INSERT INTO deal_pipeline_stages (project_id, name, color, sort_order)
      VALUES (${projectId}, ${stage.name}, ${stage.color}, ${stage.sort_order})
    `;
  }
}

// ── GET: List stages for a project ───────────────────────────────────

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  if (!(await verifyProjectOwnership(projectId, user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Auto-create default stages on first access
  await ensureDefaultStages(projectId);

  const db = getDb();
  const stages = await db`
    SELECT * FROM deal_pipeline_stages
    WHERE project_id = ${projectId}
    ORDER BY sort_order ASC
  `;

  return NextResponse.json(stages);
}

// ── POST: Create a new stage ─────────────────────────────────────────

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, name, color, sort_order } = body;

  if (!projectId || !name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!(await verifyProjectOwnership(projectId, user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const db = getDb();

  try {
    // If no sort_order provided, put it at the end
    let order = sort_order;
    if (order === undefined || order === null) {
      const maxRows = await db`
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
        FROM deal_pipeline_stages
        WHERE project_id = ${projectId}
      `;
      order = maxRows[0].next_order;
    }

    const rows = await db`
      INSERT INTO deal_pipeline_stages (project_id, name, color, sort_order)
      VALUES (${projectId}, ${name}, ${color ?? '#3b82f6'}, ${order})
      RETURNING *
    `;

    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("Failed to create stage:", err);
    return NextResponse.json({ error: "Failed to create stage" }, { status: 500 });
  }
}

// ── PATCH: Update a stage ────────────────────────────────────────────

export async function PATCH(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, stageId, name, color, sort_order } = body;

  if (!projectId || !stageId) {
    return NextResponse.json({ error: "Missing projectId or stageId" }, { status: 400 });
  }

  if (!(await verifyProjectOwnership(projectId, user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const db = getDb();

  try {
    const rows = await db`
      UPDATE deal_pipeline_stages SET
        name = COALESCE(${name ?? null}, name),
        color = COALESCE(${color ?? null}, color),
        sort_order = COALESCE(${sort_order ?? null}, sort_order)
      WHERE id = ${stageId} AND project_id = ${projectId}
      RETURNING *
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "Stage not found" }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("Failed to update stage:", err);
    return NextResponse.json({ error: "Failed to update stage" }, { status: 500 });
  }
}

// ── DELETE: Remove a stage (only if no deals in it) ──────────────────

export async function DELETE(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const stageId = searchParams.get("stageId");

  if (!projectId || !stageId) {
    return NextResponse.json({ error: "Missing projectId or stageId" }, { status: 400 });
  }

  if (!(await verifyProjectOwnership(projectId, user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const db = getDb();

  // Check for deals in this stage
  const dealCount = await db`
    SELECT COUNT(*)::int AS count FROM deals WHERE stage_id = ${stageId}
  `;

  if (dealCount[0].count > 0) {
    return NextResponse.json(
      { error: "Cannot delete stage with existing deals. Move or delete deals first." },
      { status: 409 }
    );
  }

  try {
    await db`
      DELETE FROM deal_pipeline_stages WHERE id = ${stageId} AND project_id = ${projectId}
    `;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete stage:", err);
    return NextResponse.json({ error: "Failed to delete stage" }, { status: 500 });
  }
}
