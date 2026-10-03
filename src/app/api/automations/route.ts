import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { projectIdSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });

  const db = getDb();
  // Verify ownership
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rules = await db`
    SELECT * FROM automation_rules
    WHERE project_id = ${projectId}
    ORDER BY created_at DESC
  `;

  return NextResponse.json(rules);
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, triggerType, triggerConfig, actionType, actionConfig } = body;

  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });

  if (!triggerType || !actionType) {
    return NextResponse.json({ error: "Missing trigger or action type" }, { status: 400 });
  }

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [rule] = await db`
    INSERT INTO automation_rules (project_id, trigger_type, trigger_config, action_type, action_config)
    VALUES (${projectId}, ${triggerType}, ${JSON.stringify(triggerConfig || {})}, ${actionType}, ${JSON.stringify(actionConfig || {})})
    RETURNING *
  `;

  return NextResponse.json(rule, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { ruleId, enabled } = body;

  if (!ruleId) return NextResponse.json({ error: "Missing rule ID" }, { status: 400 });

  const db = getDb();
  // Verify ownership through project
  const rules = await db`
    SELECT ar.id FROM automation_rules ar
    JOIN projects p ON ar.project_id = p.id
    WHERE ar.id = ${ruleId} AND p.user_id = ${user.id}
  `;
  if (rules.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [updated] = await db`
    UPDATE automation_rules
    SET enabled = ${enabled}
    WHERE id = ${ruleId}
    RETURNING *
  `;

  return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const ruleId = searchParams.get("ruleId");
  if (!ruleId) return NextResponse.json({ error: "Missing rule ID" }, { status: 400 });

  const db = getDb();
  const rules = await db`
    SELECT ar.id FROM automation_rules ar
    JOIN projects p ON ar.project_id = p.id
    WHERE ar.id = ${ruleId} AND p.user_id = ${user.id}
  `;
  if (rules.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db`DELETE FROM automation_rules WHERE id = ${ruleId}`;

  return NextResponse.json({ success: true });
}
