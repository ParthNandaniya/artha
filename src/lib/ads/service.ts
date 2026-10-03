import { getDb } from "@/lib/neon";
import { generateJSON } from "@/lib/openai";
import {
  DEFAULT_IMAGE_PROVIDER,
  DEFAULT_VIDEO_PROVIDER,
  buildAdsBudgetSplit,
  normalizeAdsSettings,
  serializeAdsSettings,
} from "@/lib/ads/config";
import { getImageProvider, getPlatformProvider, getVideoProvider } from "@/lib/ads/providers";
import type {
  AdsCampaign,
  AdsCopyBundle,
  AdsCreativeAsset,
  AdsDashboardData,
  AdsResearchSummary,
  AdsSettings,
} from "@/lib/ads/types";

interface CompanyProfileRow {
  name: string | null;
  tagline: string | null;
  founder_role: string | null;
  settings: Record<string, unknown> | null;
}

interface ResearchDocumentRow {
  id: string;
  title: string;
  content: string | null;
  updated_at: string;
}

interface CampaignStrategy {
  campaignName: string;
  objective: string;
  targetAudience: string;
  primaryText: string;
  description: string;
  caption: string;
  cta: string;
  headlines: string[];
  imageConcepts: Array<{ title: string; prompt: string }>;
  videoConcepts: Array<{ title: string; prompt: string }>;
}

export async function getAdsSettings(projectId: string): Promise<AdsSettings> {
  const profile = await getCompanyProfile(projectId);
  return normalizeAdsSettings(profile?.settings);
}

export async function updateAdsSettings(
  projectId: string,
  updates: Partial<AdsSettings>
): Promise<AdsSettings> {
  const db = getDb();
  const profile = await getCompanyProfile(projectId);
  const currentSettings = normalizeAdsSettings(profile?.settings);
  const nextSettings: AdsSettings = {
    ...currentSettings,
    ...updates,
  };

  const existingSettings = profile?.settings || {};
  const mergedSettings = {
    ...existingSettings,
    ...serializeAdsSettings(nextSettings),
  };

  await db`
    UPDATE company_profile
    SET settings = ${JSON.stringify(mergedSettings)}::jsonb
    WHERE project_id = ${projectId}
  `;

  return nextSettings;
}

export async function getAdsDashboardData(projectId: string): Promise<AdsDashboardData> {
  const [settings, latestResearch, campaigns] = await Promise.all([
    getAdsSettings(projectId),
    getLatestAdsResearch(projectId),
    getAdsCampaigns(projectId),
  ]);

  return {
    settings,
    latestResearch,
    campaigns,
  };
}

export async function prepareAdsCampaign(args: {
  projectId: string;
  projectName: string;
  projectSlug: string;
}): Promise<AdsCampaign> {
  const { projectId, projectName, projectSlug } = args;
  const db = getDb();
  const [settings, profile, research] = await Promise.all([
    getAdsSettings(projectId),
    getCompanyProfile(projectId),
    getLatestAdsResearchRecord(projectId),
  ]);

  const budget = buildAdsBudgetSplit(settings.dailyBudgetCents, settings.platformFeePercent);
  const strategy = await buildCampaignStrategy({
    projectName,
    projectSlug,
    profile,
    research,
    settings,
  });
  const copyBundle: AdsCopyBundle = {
    headlines: strategy.headlines,
    primaryText: strategy.primaryText,
    description: strategy.description,
    caption: strategy.caption,
    cta: strategy.cta,
    audience: strategy.targetAudience,
    researchSummary: research?.content
      ? summarizeText(research.content, 280)
      : "No dedicated ads research yet. This draft is using company context and saved settings.",
  };
  const creativeAssets = await buildCreativeAssets({
    strategy,
    projectName,
    projectSlug,
    settings,
  });
  const initialStatus = settings.autoLaunch ? "draft" : "ready_for_review";

  const rows = await db`
    INSERT INTO ad_campaigns (
      project_id,
      name,
      status,
      platform,
      objective,
      target_audience,
      daily_budget_cents,
      media_spend_cents,
      platform_fee_cents,
      currency,
      auto_launch,
      creative_format,
      account_connection_model,
      research_document_id,
      copy_bundle,
      creative_assets,
      provider
    )
    VALUES (
      ${projectId},
      ${strategy.campaignName},
      ${initialStatus},
      ${settings.platform},
      ${strategy.objective},
      ${strategy.targetAudience},
      ${budget.totalBudgetCents},
      ${budget.mediaSpendCents},
      ${budget.platformFeeCents},
      'usd',
      ${settings.autoLaunch},
      ${settings.creativeFormat},
      ${settings.accountConnectionModel},
      ${research?.id || null},
      ${JSON.stringify(copyBundle)}::jsonb,
      ${JSON.stringify(creativeAssets)}::jsonb,
      'meta_live'
    )
    RETURNING *
  `;

  const campaign = parseAdsCampaign(rows[0]);
  if (!settings.autoLaunch) return campaign;

  return requestAdsCampaignLaunch(projectId, campaign.id);
}

export async function requestAdsCampaignLaunch(
  projectId: string,
  campaignId: string
): Promise<AdsCampaign> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM ad_campaigns
    WHERE id = ${campaignId} AND project_id = ${projectId}
    LIMIT 1
  `;
  if (rows.length === 0) {
    throw new Error("Ad campaign not found");
  }

  const campaign = parseAdsCampaign(rows[0]);
  if (campaign.status === "launch_requested" || campaign.status === "active") {
    return campaign;
  }

  const settings = await getAdsSettings(projectId);
  const provider = getPlatformProvider(campaign.platform);
  const launch = await provider.launchCampaign(campaign, settings, projectId);

  const updatedRows = await db`
    UPDATE ad_campaigns
    SET
      status = ${launch.status},
      external_campaign_id = ${launch.externalCampaignId},
      external_adset_id = ${launch.externalAdSetId || null},
      external_creative_id = ${launch.externalCreativeId || null},
      external_ad_id = ${launch.externalAdId || null},
      launch_notes = ${launch.launchNotes},
      launched_at = ${launch.launchedAt},
      updated_at = NOW()
    WHERE id = ${campaignId} AND project_id = ${projectId}
    RETURNING *
  `;

  return parseAdsCampaign(updatedRows[0]);
}

async function getCompanyProfile(projectId: string): Promise<CompanyProfileRow | null> {
  const db = getDb();
  const rows = await db`
    SELECT name, tagline, founder_role, settings
    FROM company_profile
    WHERE project_id = ${projectId}
    LIMIT 1
  `;
  return (rows[0] as CompanyProfileRow | undefined) ?? null;
}

async function getLatestAdsResearch(projectId: string): Promise<AdsResearchSummary | null> {
  const research = await getLatestAdsResearchRecord(projectId);
  if (!research) return null;

  return {
    id: research.id,
    title: research.title,
    excerpt: summarizeText(research.content || "", 220),
    updatedAt: research.updated_at,
  };
}

async function getLatestAdsResearchRecord(projectId: string): Promise<ResearchDocumentRow | null> {
  const db = getDb();
  const rows = await db`
    SELECT id, title, content, COALESCE(updated_at, created_at) AS updated_at
    FROM documents
    WHERE project_id = ${projectId} AND type = 'ads_research'
    ORDER BY COALESCE(updated_at, created_at) DESC
    LIMIT 1
  `;
  return (rows[0] as ResearchDocumentRow | undefined) ?? null;
}

async function getAdsCampaigns(projectId: string): Promise<AdsCampaign[]> {
  const db = getDb();
  const rows = await db`
    SELECT *
    FROM ad_campaigns
    WHERE project_id = ${projectId}
    ORDER BY created_at DESC
    LIMIT 8
  `;
  return rows.map((row) => parseAdsCampaign(row));
}

function parseAdsCampaign(row: Record<string, unknown>): AdsCampaign {
  return {
    id: String(row.id),
    name: String(row.name || "Untitled campaign"),
    status: asString(row.status, "draft") as AdsCampaign["status"],
    platform: "meta",
    objective: asString(row.objective, "Lead generation"),
    targetAudience: asString(row.target_audience, "Warm buyers matched to the company's strongest intent signals."),
    dailyBudgetCents: asNumber(row.daily_budget_cents),
    mediaSpendCents: asNumber(row.media_spend_cents),
    platformFeeCents: asNumber(row.platform_fee_cents),
    currency: asString(row.currency, "usd"),
    autoLaunch: Boolean(row.auto_launch),
    accountConnectionModel: "customer_owned_meta_account",
    creativeFormat: row.creative_format === "video" ? "video" : "image",
    researchDocumentId: row.research_document_id ? String(row.research_document_id) : null,
    copyBundle: asCopyBundle(row.copy_bundle),
    creativeAssets: asCreativeAssets(row.creative_assets),
    launchNotes: row.launch_notes ? String(row.launch_notes) : null,
    provider: asString(row.provider, "meta_partner_manual"),
    externalCampaignId: row.external_campaign_id ? String(row.external_campaign_id) : null,
    createdAt: asDateString(row.created_at),
    updatedAt: asDateString(row.updated_at),
    launchedAt: row.launched_at ? asDateString(row.launched_at) : null,
  };
}

async function buildCampaignStrategy(args: {
  projectName: string;
  projectSlug: string;
  profile: CompanyProfileRow | null;
  research: ResearchDocumentRow | null;
  settings: AdsSettings;
}): Promise<CampaignStrategy> {
  if (process.env.OPENAI_API_KEY) {
    try {
      return await generateJSON<CampaignStrategy>(
        [
          "You are a direct-response performance marketer building Meta ad drafts for a startup.",
          "Return JSON only.",
          "Keep copy concrete, not generic.",
          "Write for a customer-owned Meta ad account where the platform fee is charged separately from media spend.",
          "Preferred creative format can be image or video.",
          "If the preferred format is image, prioritize image concepts and keep video concepts minimal or empty.",
          "If the preferred format is video, prioritize short-form video concepts and keep image concepts minimal or empty.",
          "Provide 4 short headlines.",
        ].join(" "),
        JSON.stringify(
          {
            projectName: args.projectName,
            projectSlug: args.projectSlug,
            tagline: args.profile?.tagline || null,
            founderRole: args.profile?.founder_role || null,
            dailyBudgetUsd: (args.settings.dailyBudgetCents / 100).toFixed(2),
            creativeFormat: args.settings.creativeFormat,
            research: summarizeText(args.research?.content || "", 1800),
          },
          null,
          2
        ),
        { model: "gpt-4o", temperature: 0.6, maxTokens: 1200 }
      );
    } catch {
      // Fall back to deterministic copy so ads still work without provider availability.
    }
  }

  const promise =
    args.profile?.tagline?.trim() ||
    `${args.projectName} helps customers move from manual work to a faster, cleaner outcome.`;
  const audience = args.research?.content
    ? summarizeText(args.research.content, 160)
    : `Founders, operators, and teams already looking for a faster way to solve the problem ${args.projectName} addresses.`;

  return {
    campaignName: `${args.projectName} acquisition push`,
    objective: "Lead generation",
    targetAudience: audience,
    primaryText: `${promise} Start with a tight Meta campaign focused on warm-intent buyers and a simple conversion path.`,
    description: `Daily budget split between media spend and Artha management so acquisition stays measurable from day one.`,
    caption: `Generated from company context${args.research ? " and the latest ads research" : ""}.`,
    cta: "Start now",
    headlines: [
      `${args.projectName}, without the busywork`,
      `Turn interest into qualified leads`,
      `Launch a clearer offer today`,
      `Meta ads tuned for ${args.projectName}`,
    ],
    imageConcepts: [
      {
        title: `${args.projectName} hero static`,
        prompt: `Create a polished product-focused static ad for ${args.projectName}. Emphasize ${promise}`,
      },
      {
        title: `${args.projectName} pain-point contrast`,
        prompt: `Show the before/after of using ${args.projectName} with clean typography and direct-response layout.`,
      },
    ],
    videoConcepts: [
      {
        title: `${args.projectName} founder-style short video`,
        prompt: `Create a 15-second vertical concept for ${args.projectName} with hook, proof, CTA, captions, and quick product motion.`,
      },
    ],
  };
}

async function buildCreativeAssets(args: {
  strategy: CampaignStrategy;
  projectName: string;
  projectSlug: string;
  settings: AdsSettings;
}): Promise<AdsCreativeAsset[]> {
  const context = {
    projectName: args.projectName,
    projectSlug: args.projectSlug,
    audience: args.strategy.targetAudience,
  };
  const format = args.settings.creativeFormat;

  if (format === "video") {
    const videoProvider = getVideoProvider(DEFAULT_VIDEO_PROVIDER);
    const videoConcepts =
      args.strategy.videoConcepts.length > 0
        ? args.strategy.videoConcepts
        : [
            {
              title: `${args.projectName} short-form video`,
              prompt: `Create a 15-second ad for ${args.projectName} with captions, a clear hook, and a direct CTA.`,
            },
          ];
    return videoProvider.generateAssets(videoConcepts, context);
  }

  const imageProvider = getImageProvider(DEFAULT_IMAGE_PROVIDER);
  const imageConcepts =
    args.strategy.imageConcepts.length > 0
      ? args.strategy.imageConcepts
      : [
          {
            title: `${args.projectName} static image ad`,
            prompt: `Create a polished static ad for ${args.projectName} with one clear promise and one CTA.`,
          },
        ];
  return imageProvider.generateAssets(imageConcepts, context);
}

function summarizeText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value || 0);
}

function asDateString(value: unknown) {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return new Date().toISOString();
}

function asCopyBundle(value: unknown): AdsCopyBundle {
  const parsed = parseUnknownJson(value) as Record<string, unknown>;
  return {
    headlines: Array.isArray(parsed?.headlines)
      ? parsed.headlines.map((headline) => String(headline))
      : [],
    primaryText: asString(parsed?.primaryText, ""),
    description: asString(parsed?.description, ""),
    caption: asString(parsed?.caption, ""),
    cta: asString(parsed?.cta, "Learn more"),
    audience: asString(parsed?.audience, ""),
    researchSummary: asString(parsed?.researchSummary, ""),
  };
}

function asCreativeAssets(value: unknown): AdsCreativeAsset[] {
  const parsed = parseUnknownJson(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((asset) => ({
    id: String(asset?.id || crypto.randomUUID()),
    kind: asset?.kind === "video" ? "video" : "image",
    title: asString(asset?.title, "Creative concept"),
    prompt: asString(asset?.prompt, ""),
    previewUrl: typeof asset?.previewUrl === "string" ? asset.previewUrl : null,
    provider: asString(asset?.provider, "Unknown provider"),
    model: asString(asset?.model, "n/a"),
    status: asset?.status === "generated" ? "generated" : "placeholder",
    notes: typeof asset?.notes === "string" ? asset.notes : null,
  }));
}

function parseUnknownJson(value: unknown) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}
