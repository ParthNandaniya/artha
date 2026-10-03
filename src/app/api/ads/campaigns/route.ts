import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { ensureAdsSchema } from "@/lib/ads/schema";
import { prepareAdsCampaign } from "@/lib/ads/service";

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId } = body as { projectId?: string };
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const db = getDb();
  const rows = await db`
    SELECT id, name, slug, subscription_status
    FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
    LIMIT 1
  `;
  const project = rows[0];
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (project.subscription_status !== "active") {
    return NextResponse.json(
      { error: "Only subscribed projects can prepare ad campaigns." },
      { status: 403 }
    );
  }

  await ensureAdsSchema(db);

  try {
    const campaign = await prepareAdsCampaign({
      projectId: project.id,
      projectName: String(project.name),
      projectSlug: String(project.slug),
    });

    return NextResponse.json({ campaign });
  } catch (err) {
    console.error("Failed to prepare ad campaign:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to prepare campaign" },
      { status: 500 }
    );
  }
}
