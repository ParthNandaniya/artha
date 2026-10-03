import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { sendCompanyWelcome } from "@/lib/postmark";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId } = body as { projectId?: string };
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();
  const rows = await db`
    SELECT id, name, slug, first_tweet_url
    FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
  `;
  if (rows.length === 0) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const project = rows[0] as {
    id: string;
    name: string;
    slug: string;
    first_tweet_url: string | null;
  };

  try {
    const queuedTasks = await db`
      SELECT title, description FROM tasks WHERE project_id = ${projectId} AND status = 'queued' ORDER BY priority ASC LIMIT 3
    `;

    const researchDocs = await db`
      SELECT content FROM documents WHERE project_id = ${projectId} AND type = 'market_research' ORDER BY created_at DESC LIMIT 1
    `;

    const researchSummary = researchDocs.length > 0
      ? (researchDocs[0].content as string).split("\n").filter((l: string) => l.trim()).slice(0, 2).join(" ").slice(0, 300)
      : undefined;

    await sendCompanyWelcome({
      slug: project.slug,
      companyName: project.name,
      founderEmail: user.email as string,
      founderName: user.name as string | null,
      researchSummary,
      tweetUrl: project.first_tweet_url || undefined,
      tasks: queuedTasks.map((t: Record<string, unknown>) => ({
        title: t.title as string,
        description: (t.description as string)?.slice(0, 80),
      })),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to send test welcome email", error);
    return NextResponse.json({ error: "Failed to send test email" }, { status: 500 });
  }
}
