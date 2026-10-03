import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { activateCampaign, updateCampaignStatus } from "@/lib/ads/meta-api";

/**
 * POST /api/ads/campaigns/activate
 * Body: { projectId, campaignId, action: "activate" | "pause" }
 * Toggle a live Meta campaign between active and paused.
 */
export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, campaignId, action } = body as {
    projectId?: string;
    campaignId?: string;
    action?: "activate" | "pause";
  };

  if (!projectId || !campaignId) {
    return NextResponse.json({ error: "Missing projectId or campaignId" }, { status: 400 });
  }

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const campaigns = await db`
    SELECT external_campaign_id, status FROM ad_campaigns
    WHERE id = ${campaignId} AND project_id = ${projectId}
    LIMIT 1
  `;
  if (campaigns.length === 0) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const externalId = campaigns[0].external_campaign_id as string | null;
  if (!externalId) {
    return NextResponse.json({ error: "Campaign not launched to Meta yet" }, { status: 400 });
  }

  const connections = await db`
    SELECT access_token, metadata FROM social_connections
    WHERE project_id = ${projectId} AND platform = 'meta'
    LIMIT 1
  `;
  if (connections.length === 0) {
    return NextResponse.json({ error: "Meta not connected" }, { status: 400 });
  }

  const accessToken = connections[0].access_token as string;
  const metadata = (connections[0].metadata || {}) as Record<string, unknown>;
  const adAccountId = metadata.selectedAdAccountId as string;

  const opts = { accessToken, adAccountId };

  try {
    if (action === "pause") {
      await updateCampaignStatus(opts, externalId, "PAUSED");
      await db`UPDATE ad_campaigns SET status = 'paused', updated_at = NOW() WHERE id = ${campaignId}`;
      return NextResponse.json({ status: "paused" });
    } else {
      await activateCampaign(opts, externalId);
      await db`UPDATE ad_campaigns SET status = 'active', updated_at = NOW() WHERE id = ${campaignId}`;
      return NextResponse.json({ status: "active" });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update campaign status" },
      { status: 500 }
    );
  }
}
