import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";

// ── Types ────────────────────────────────────────────────────────────

interface CalendarPostRow {
  id: string;
  project_id: string;
  platform: string;
  content: string;
  media_urls: string[];
  status: string;
  scheduled_at: string;
  posted_at: string | null;
  external_id: string | null;
  external_url: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface TwitterBotRow {
  id: string;
  project_id: string;
  content: string;
  status: string;
  posted_at: string | null;
  created_at: string;
  category: string;
}

// ── GET: list scheduled content for a project + month ────────────────

export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const month = searchParams.get("month"); // YYYY-MM

  if (!projectId || !month) {
    return NextResponse.json(
      { error: "Missing projectId or month" },
      { status: 400 },
    );
  }

  // Validate month format
  const monthMatch = month.match(/^(\d{4})-(\d{2})$/);
  if (!monthMatch) {
    return NextResponse.json(
      { error: "Invalid month format. Use YYYY-MM" },
      { status: 400 },
    );
  }

  const db = getDb();

  // Verify project ownership
  const projects = await db`
    SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id} LIMIT 1
  `;
  if (projects.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const yearNum = parseInt(monthMatch[1], 10);
  const monthNum = parseInt(monthMatch[2], 10);
  const startDate = new Date(yearNum, monthNum - 1, 1).toISOString();
  const endDate = new Date(yearNum, monthNum, 1).toISOString();

  // Fetch from content_calendar
  const calendarRows = (await db`
    SELECT id, project_id, platform, content, media_urls, status,
           scheduled_at, posted_at, external_id, external_url, error,
           metadata, created_at
    FROM content_calendar
    WHERE project_id = ${projectId}
      AND scheduled_at >= ${startDate}
      AND scheduled_at < ${endDate}
    ORDER BY scheduled_at ASC
  `) as CalendarPostRow[];

  // Fetch from twitter_bot_posts for this project in the same range
  const twitterRows = (await db`
    SELECT id, project_id, content, status, posted_at, created_at, category
    FROM twitter_bot_posts
    WHERE project_id = ${projectId}
      AND (
        (posted_at >= ${startDate} AND posted_at < ${endDate})
        OR (posted_at IS NULL AND created_at >= ${startDate} AND created_at < ${endDate})
      )
    ORDER BY COALESCE(posted_at, created_at) ASC
  `) as TwitterBotRow[];

  // Unify into a single list
  const unified = [
    ...calendarRows.map((row) => ({
      ...row,
      source: "content_calendar" as const,
    })),
    ...twitterRows.map((row) => ({
      id: row.id,
      project_id: row.project_id,
      platform: "twitter" as const,
      content: row.content,
      media_urls: [] as string[],
      status: row.status,
      scheduled_at: row.posted_at ?? row.created_at,
      posted_at: row.posted_at,
      external_id: null,
      external_url: null,
      error: null,
      metadata: { category: row.category } as Record<string, unknown>,
      created_at: row.created_at,
      source: "twitter_bot" as const,
    })),
  ];

  // Sort by scheduled_at
  unified.sort(
    (a, b) =>
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  );

  return NextResponse.json(unified);
}

// ── POST: create a new scheduled post ────────────────────────────────

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { projectId, platform, content, scheduledAt } = body as {
    projectId: string;
    platform: string;
    content: string;
    scheduledAt: string;
  };

  if (!projectId || !platform || !scheduledAt) {
    return NextResponse.json(
      { error: "Missing required fields: projectId, platform, scheduledAt" },
      { status: 400 },
    );
  }

  const db = getDb();

  // Verify project ownership
  const projects = await db`
    SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id} LIMIT 1
  `;
  if (projects.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const rows = await db`
    INSERT INTO content_calendar (project_id, platform, content, scheduled_at, status)
    VALUES (${projectId}, ${platform}, ${content || ""}, ${scheduledAt}, 'scheduled')
    RETURNING *
  `;

  return NextResponse.json(rows[0]);
}

// ── PATCH: update a post (reschedule, edit content) ──────────────────

export async function PATCH(request: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { projectId, postId, content, scheduledAt, status, platform } =
    body as {
      projectId: string;
      postId: string;
      content?: string;
      scheduledAt?: string;
      status?: string;
      platform?: string;
    };

  if (!projectId || !postId) {
    return NextResponse.json(
      { error: "Missing projectId or postId" },
      { status: 400 },
    );
  }

  const db = getDb();

  // Verify project ownership
  const projects = await db`
    SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id} LIMIT 1
  `;
  if (projects.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Verify post belongs to project
  const existing = await db`
    SELECT id, status FROM content_calendar
    WHERE id = ${postId} AND project_id = ${projectId}
    LIMIT 1
  `;
  if (existing.length === 0) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  // Build dynamic update
  const updates: Record<string, string> = {};
  if (content !== undefined) updates.content = content;
  if (scheduledAt !== undefined) updates.scheduled_at = scheduledAt;
  if (status !== undefined) updates.status = status;
  if (platform !== undefined) updates.platform = platform;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 },
    );
  }

  // Use individual SET clauses since neon tagged templates
  // don't support dynamic column names easily
  const rows = await db`
    UPDATE content_calendar
    SET
      content = COALESCE(${content ?? null}, content),
      scheduled_at = COALESCE(${scheduledAt ?? null}::timestamptz, scheduled_at),
      status = COALESCE(${status ?? null}, status),
      platform = COALESCE(${platform ?? null}, platform)
    WHERE id = ${postId} AND project_id = ${projectId}
    RETURNING *
  `;

  return NextResponse.json(rows[0]);
}
