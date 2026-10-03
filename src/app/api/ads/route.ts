import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { ensureAdsSchema } from "@/lib/ads/schema";
import {
  getAdsDashboardData,
  prepareAdsCampaign,
  updateAdsSettings,
} from "@/lib/ads/service";
import { isAdsCreativeFormat } from "@/lib/ads/config";
import type { AdsSettings } from "@/lib/ads/types";

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getProjectForUser(request, user.id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const db = getDb();
  await ensureAdsSchema(db);

  const data = await getAdsDashboardData(project.id);
  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const project = await getProjectByIdForUser(body.projectId, user.id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const db = getDb();
  await ensureAdsSchema(db);

  const updates: Partial<AdsSettings> = {};
  if (typeof body.dailyBudgetCents === "number") updates.dailyBudgetCents = body.dailyBudgetCents;
  if (typeof body.autoLaunch === "boolean") updates.autoLaunch = body.autoLaunch;
  if (typeof body.platformFeePercent === "number") {
    updates.platformFeePercent = body.platformFeePercent;
  }
  if (body.platform === "meta") updates.platform = body.platform;
  if (body.accountConnectionModel === "customer_owned_meta_account") {
    updates.accountConnectionModel = body.accountConnectionModel;
  }
  if (isAdsCreativeFormat(body.creativeFormat)) updates.creativeFormat = body.creativeFormat;

  const settings = await updateAdsSettings(project.id, updates);
  return NextResponse.json(settings);
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const project = await getProjectByIdForUser(body.projectId, user.id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (project.subscription_status !== "active") {
    return NextResponse.json(
      { error: "Only subscribed projects can prepare ad campaigns." },
      { status: 403 }
    );
  }

  const db = getDb();
  await ensureAdsSchema(db);

  const campaign = await prepareAdsCampaign({
    projectId: project.id,
    projectName: project.name,
    projectSlug: project.slug,
  });

  return NextResponse.json({ campaign });
}

async function getProjectForUser(request: Request, userId: string) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return null;
  return getProjectByIdForUser(projectId, userId);
}

async function getProjectByIdForUser(projectId: string | null | undefined, userId: string) {
  if (!projectId) return null;
  const db = getDb();
  const rows = await db`
    SELECT id, name, slug, subscription_status
    FROM projects
    WHERE id = ${projectId} AND user_id = ${userId}
    LIMIT 1
  `;

  return rows[0] || null;
}
