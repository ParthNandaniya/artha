import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();
  const projects = await db`
    SELECT id
    FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
    LIMIT 1
  `;
  if (projects.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const rows = await db`SELECT settings FROM company_profile WHERE project_id = ${projectId} LIMIT 1`;
    const settings = rows.length > 0 ? (rows[0].settings || {}) : {};
    return NextResponse.json({ outreach_auto_send: false, ads_auto_launch: true, email_auto_respond: true, show_in_showcase: true, ...settings });
  } catch {
    return NextResponse.json({ outreach_auto_send: false, ads_auto_launch: true, email_auto_respond: true, show_in_showcase: true });
  }
}

export async function PATCH(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, ...settingsUpdate } = body;
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();
  const projects = await db`
    SELECT id
    FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
    LIMIT 1
  `;
  if (projects.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await db`SELECT settings FROM company_profile WHERE project_id = ${projectId} LIMIT 1`;
  const currentSettings = existing.length > 0 ? (existing[0].settings || {}) : {};
  const newSettings = { ...currentSettings, ...settingsUpdate };

  await db`UPDATE company_profile SET settings = ${JSON.stringify(newSettings)}::jsonb WHERE project_id = ${projectId}`;

  return NextResponse.json(newSettings);
}
