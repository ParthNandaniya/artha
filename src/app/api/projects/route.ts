import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { withProjectCredits } from "@/lib/project-credits";
import { CreateProjectSchema, UpdateProjectSchema, parseBody } from "@/lib/validation";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const rows = await db`
    SELECT * FROM projects WHERE user_id = ${user.id} ORDER BY created_at DESC
  `;
  const projects = rows.map((row) => withProjectCredits(row as Record<string, unknown>));
  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json();
  const parsed = parseBody(CreateProjectSchema, raw);
  if (!parsed.success) return parsed.response;
  const { name, slug, status, memory } = parsed.data;

  const db = getDb();

  // Enforce per-user company limit: 5 for subscribers, 2 for free users
  const [{ count: projectCount }] = await db`
    SELECT COUNT(*)::int AS count FROM projects WHERE user_id = ${user.id}
  `;
  const [{ has_sub: hasSubscription }] = await db`
    SELECT EXISTS(
      SELECT 1 FROM projects WHERE user_id = ${user.id} AND subscription_status = 'active'
    ) AS has_sub
  `;
  const maxProjects = hasSubscription ? 5 : 3;
  if (projectCount >= maxProjects) {
    return NextResponse.json(
      { error: hasSubscription ? "You can create up to 5 companies" : "Free users can create up to 3 companies. Upgrade to Pro for more." },
      { status: 403 }
    );
  }

  const rows = await db`
    INSERT INTO projects (user_id, name, slug, status, memory)
    VALUES (${user.id}, ${name}, ${slug}, ${status}, ${JSON.stringify(memory)}::jsonb)
    RETURNING *
  `;

  return NextResponse.json(withProjectCredits(rows[0] as Record<string, unknown>));
}

export async function PATCH(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json();
  const parsed = parseBody(UpdateProjectSchema, raw);
  if (!parsed.success) return parsed.response;
  const { id, name } = parsed.data;

  const db = getDb();

  const rows = await db`
    UPDATE projects SET name = ${name}
    WHERE id = ${id} AND user_id = ${user.id}
    RETURNING *
  `;

  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(withProjectCredits(rows[0] as Record<string, unknown>));
}
