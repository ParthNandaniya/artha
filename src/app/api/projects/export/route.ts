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

  // Verify ownership
  const projects = await db`
    SELECT id, name, slug, status, subscription_status, created_at
    FROM projects WHERE id = ${projectId} AND user_id = ${user.id}
  `;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const project = projects[0];

  // Fetch all exportable data in parallel
  const [tasks, documents, emailThreads, analytics, leads, memory, contacts] = await Promise.all([
    db`SELECT id, title, description, type, status, priority, is_recurring, recurrence_interval, created_at, result, summary
       FROM tasks WHERE project_id = ${projectId} ORDER BY created_at DESC`,
    db`SELECT id, type, title, content, metadata, created_at
       FROM documents WHERE project_id = ${projectId} ORDER BY created_at DESC`,
    db`SELECT id, subject, participants, message_count, last_message_at, snippet, is_read, created_at
       FROM email_threads WHERE project_id = ${projectId} ORDER BY last_message_at DESC`,
    db`SELECT event, path, visitor_id, referrer, screen_width, duration_ms, created_at
       FROM site_analytics WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 10000`,
    db`SELECT id, name, email, company, role, score, status, tags, metadata, created_at
       FROM leads WHERE project_id = ${projectId} ORDER BY created_at DESC`,
    db`SELECT key, value FROM memory WHERE project_id = ${projectId}`,
    db`SELECT id, email, name, source, subscribed, created_at
       FROM contacts WHERE project_id = ${projectId} ORDER BY created_at DESC`,
  ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      status: project.status,
      subscriptionStatus: project.subscription_status,
      createdAt: project.created_at,
    },
    tasks,
    documents,
    emailThreads,
    analytics: {
      totalEvents: analytics.length,
      events: analytics,
    },
    leads,
    contacts,
    memory: Object.fromEntries(
      memory.map((m: Record<string, unknown>) => [m.key, m.value])
    ),
  };

  return new Response(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${project.slug}-export-${new Date().toISOString().split("T")[0]}.json"`,
    },
  });
}
