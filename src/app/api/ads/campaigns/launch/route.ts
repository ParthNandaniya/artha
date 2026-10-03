import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { ensureAdsSchema } from "@/lib/ads/schema";
import { requestAdsCampaignLaunch } from "@/lib/ads/service";

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, campaignId } = body as { projectId?: string; campaignId?: string };
  if (!projectId || !campaignId) {
    return NextResponse.json({ error: "Missing projectId or campaignId" }, { status: 400 });
  }

  const db = getDb();
  const rows = await db`
    SELECT id, subscription_status
    FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
    LIMIT 1
  `;
  const project = rows[0];
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (project.subscription_status !== "active") {
    return NextResponse.json(
      { error: "Only subscribed projects can launch ads." },
      { status: 403 }
    );
  }

  await ensureAdsSchema(db);

  try {
    const campaign = await requestAdsCampaignLaunch(projectId, campaignId);
    return NextResponse.json({ campaign });
  } catch (err) {
    console.error("Failed to launch ad campaign:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to launch campaign" },
      { status: 500 }
    );
  }
}
