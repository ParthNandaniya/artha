import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { getCampaignInsights } from "@/lib/ads/meta-api";

/**
 * GET /api/ads/campaigns/insights?projectId=X&campaignId=Y
 * Fetch live performance metrics from Meta for a campaign.
 */
export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  const campaignId = request.nextUrl.searchParams.get("campaignId");
  if (!projectId || !campaignId) {
    return NextResponse.json({ error: "Missing projectId or campaignId" }, { status: 400 });
  }

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Get campaign's external ID
  const campaigns = await db`
    SELECT external_campaign_id FROM ad_campaigns
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

  // Get Meta connection
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

  try {
    const insights = await getCampaignInsights(
      { accessToken, adAccountId },
      externalId,
      request.nextUrl.searchParams.get("datePreset") || "last_7d"
    );

    return NextResponse.json({ insights });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch insights" },
      { status: 500 }
    );
  }
}
