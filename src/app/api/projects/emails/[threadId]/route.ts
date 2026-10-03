import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await params;
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");

  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();
  const rows = await db`
    SELECT id
    FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
  `;

  if (rows.length === 0) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  try {
    const threadRows = await db`
      SELECT id, subject, participants, last_message_at, message_count, is_read, snippet, created_at
      FROM email_threads
      WHERE id = ${threadId} AND project_id = ${projectId}
    `;

    if (threadRows.length === 0) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const messages = await db`
      SELECT id, thread_id, direction, from_email, to_email, subject, body_text, body_html, message_id, in_reply_to, created_at
      FROM email_messages
      WHERE thread_id = ${threadId} AND project_id = ${projectId}
      ORDER BY created_at ASC
    `;

    return NextResponse.json({ thread: threadRows[0], messages });
  } catch (error) {
    console.error("Failed to fetch thread", error);
    return NextResponse.json({ error: "Failed to fetch thread" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await params;
  const body = await request.json();
  const { projectId, is_read } = body as { projectId: string; is_read: boolean };

  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();
  const rows = await db`
    SELECT id
    FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
  `;

  if (rows.length === 0) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  try {
    await db`
      UPDATE email_threads SET is_read = ${is_read} WHERE id = ${threadId} AND project_id = ${projectId}
    `;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update thread", error);
    return NextResponse.json({ error: "Failed to update thread" }, { status: 500 });
  }
}
