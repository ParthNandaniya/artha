import type {
  AdsCampaign,
  AdsCampaignStatus,
  AdsCreativeAsset,
  AdsImageProviderId,
  AdsPlatform,
  AdsSettings,
  AdsVideoProviderId,
} from "@/lib/ads/types";
import { getDb } from "@/lib/neon";
import {
  launchFullCampaign,
  activateCampaign,
  MetaApiError,
} from "@/lib/ads/meta-api";

interface AssetConcept {
  title: string;
  prompt: string;
}

interface AssetContext {
  projectName: string;
  projectSlug: string;
  audience: string;
}

interface AssetProvider<T extends "image" | "video"> {
  id: AdsImageProviderId | AdsVideoProviderId;
  label: string;
  model: string;
  kind: T;
  generateAssets: (concepts: AssetConcept[], context: AssetContext) => Promise<AdsCreativeAsset[]>;
}

interface LaunchResult {
  status: AdsCampaignStatus;
  externalCampaignId: string | null;
  externalAdSetId?: string | null;
  externalCreativeId?: string | null;
  externalAdId?: string | null;
  launchNotes: string;
  launchedAt: string | null;
}

interface PlatformProvider {
  id: string;
  platform: AdsPlatform;
  launchCampaign: (campaign: AdsCampaign, settings: AdsSettings, projectId: string) => Promise<LaunchResult>;
}

function createPlaceholderPreview(args: {
  title: string;
  subtitle: string;
  accent: string;
}) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900" role="img" aria-label="${escapeXml(
      args.title
    )}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="${args.accent}" />
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#bg)" rx="36" />
      <rect x="72" y="72" width="1056" height="756" rx="28" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.25)" />
      <text x="108" y="256" fill="#f8fafc" font-size="78" font-family="Arial, Helvetica, sans-serif" font-weight="700">
        ${escapeXml(args.title)}
      </text>
      <text x="108" y="344" fill="#cbd5e1" font-size="36" font-family="Arial, Helvetica, sans-serif">
        ${escapeXml(args.subtitle)}
      </text>
      <circle cx="1010" cy="210" r="84" fill="rgba(255,255,255,0.15)" />
      <circle cx="1010" cy="210" r="54" fill="#f8fafc" opacity="0.85" />
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildAsset(
  kind: "image" | "video",
  providerLabel: string,
  model: string,
  concept: AssetConcept,
  accent: string,
  note: string
): AdsCreativeAsset {
  return {
    id: crypto.randomUUID(),
    kind,
    title: concept.title,
    prompt: concept.prompt,
    previewUrl: createPlaceholderPreview({
      title: concept.title,
      subtitle: providerLabel,
      accent,
    }),
    provider: providerLabel,
    model,
    status: "placeholder",
    notes: note,
  };
}

function createMockAssetProvider<T extends "image" | "video">(args: {
  id: AdsImageProviderId | AdsVideoProviderId;
  label: string;
  model: string;
  kind: T;
  accent: string;
}) {
  const provider: AssetProvider<T> = {
    id: args.id,
    label: args.label,
    model: args.model,
    kind: args.kind,
    async generateAssets(concepts) {
      return concepts.map((concept) =>
        buildAsset(
          args.kind,
          args.label,
          args.model,
          concept,
          args.accent,
          `Adapter placeholder: replace ${args.label} with a live provider call without changing panel or route code.`
        )
      );
    },
  };

  return provider;
}

const imageProviders: Record<AdsImageProviderId, AssetProvider<"image">> = {
  openai: createMockAssetProvider({
    id: "openai",
    label: "OpenAI Images",
    model: "gpt-image-1",
    kind: "image",
    accent: "#2563eb",
  }),
  google: createMockAssetProvider({
    id: "google",
    label: "Google Imagen",
    model: "imagen-4",
    kind: "image",
    accent: "#16a34a",
  }),
  mock: createMockAssetProvider({
    id: "mock",
    label: "Mock Image Provider",
    model: "placeholder-v1",
    kind: "image",
    accent: "#64748b",
  }),
};

const videoProviders: Record<AdsVideoProviderId, AssetProvider<"video">> = {
  openai: createMockAssetProvider({
    id: "openai",
    label: "OpenAI Video",
    model: "sora-preview",
    kind: "video",
    accent: "#f59e0b",
  }),
  google: createMockAssetProvider({
    id: "google",
    label: "Google Veo",
    model: "veo-2",
    kind: "video",
    accent: "#7c3aed",
  }),
  mock: createMockAssetProvider({
    id: "mock",
    label: "Mock Video Provider",
    model: "placeholder-v1",
    kind: "video",
    accent: "#64748b",
  }),
};

/**
 * Get the Meta social connection for a project (access token + ad account info).
 */
async function getMetaConnection(projectId: string) {
  const db = getDb();
  const rows = await db`
    SELECT access_token, account_id, metadata
    FROM social_connections
    WHERE project_id = ${projectId} AND platform = 'meta'
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return {
    accessToken: rows[0].access_token as string,
    accountId: rows[0].account_id as string,
    metadata: (rows[0].metadata || {}) as Record<string, unknown>,
  };
}

const metaLiveProvider: PlatformProvider = {
  id: "meta_live",
  platform: "meta",
  async launchCampaign(campaign, settings, projectId) {
    const connection = await getMetaConnection(projectId);

    if (!connection) {
      // No Meta account connected — fall back to manual handoff
      return metaManualFallback(campaign, settings, "Meta ad account not connected. Connect your account in the Ads panel to enable live campaign creation.");
    }

    const adAccountId = (connection.metadata.selectedAdAccountId as string) || null;
    const pageId = (connection.metadata.selectedPageId as string) || null;

    if (!adAccountId) {
      return metaManualFallback(campaign, settings, "No ad account selected. Please select an ad account in the Ads panel settings.");
    }

    if (!pageId) {
      return metaManualFallback(campaign, settings, "No Facebook Page selected. A Page is required to run ads. Please select one in the Ads panel settings.");
    }

    // Build the link URL from the project slug
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://artha.run";
    const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";

    try {
      const result = await launchFullCampaign({
        accessToken: connection.accessToken,
        adAccountId,
        pageId,
        campaignName: campaign.name,
        objective: campaign.objective,
        dailyBudgetCents: campaign.dailyBudgetCents,
        mediaSpendCents: campaign.mediaSpendCents,
        targetAudience: campaign.targetAudience,
        primaryText: campaign.copyBundle.primaryText,
        headline: campaign.copyBundle.headlines[0] || campaign.name,
        description: campaign.copyBundle.description,
        cta: campaign.copyBundle.cta,
        linkUrl: `https://${companyDomain}`,
        imageUrl: campaign.creativeAssets.find((a) => a.kind === "image" && a.previewUrl && !a.previewUrl.startsWith("data:"))?.previewUrl || undefined,
      });

      // If auto-launch, also activate the campaign
      if (settings.autoLaunch) {
        try {
          await activateCampaign(
            { accessToken: connection.accessToken, adAccountId },
            result.campaignId
          );
        } catch {
          // Campaign created but activation failed — still a success, just paused
        }
      }

      const launchedAt = new Date().toISOString();
      const isActive = settings.autoLaunch;

      return {
        status: isActive ? "active" : "launch_requested",
        externalCampaignId: result.campaignId,
        externalAdSetId: result.adSetId,
        externalCreativeId: result.adCreativeId,
        externalAdId: result.adId,
        launchedAt,
        launchNotes: [
          `Campaign created in Meta Ads Manager (${result.campaignId}).`,
          `Ad Set: ${result.adSetId}, Creative: ${result.adCreativeId}, Ad: ${result.adId}.`,
          `Media spend: $${(campaign.mediaSpendCents / 100).toFixed(2)}/day billed by Meta.`,
          `Platform fee: $${(campaign.platformFeeCents / 100).toFixed(2)}/day billed by Artha.`,
          isActive
            ? "Campaign is now ACTIVE in Meta."
            : "Campaign is PAUSED in Meta. Activate it in Meta Ads Manager or click Activate here.",
        ].join(" "),
      };
    } catch (error) {
      const message = error instanceof MetaApiError
        ? `Meta API error: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Unknown error launching campaign";

      return {
        status: "failed",
        externalCampaignId: null,
        launchedAt: new Date().toISOString(),
        launchNotes: `Launch failed: ${message}. You can retry or create the campaign manually in Meta Ads Manager using the copy and creative from this draft.`,
      };
    }
  },
};

function metaManualFallback(campaign: AdsCampaign, settings: AdsSettings, reason: string): LaunchResult {
  return {
    status: "launch_requested",
    externalCampaignId: null,
    launchedAt: new Date().toISOString(),
    launchNotes: [
      reason,
      `Media spend: $${(campaign.mediaSpendCents / 100).toFixed(2)}/day (billed by Meta).`,
      `Platform fee: $${(campaign.platformFeeCents / 100).toFixed(2)}/day (billed by Artha).`,
      settings.autoLaunch
        ? "Auto-launch is enabled but live publishing requires a connected Meta account."
        : "Manual launch mode — connect your Meta account to enable live campaign creation.",
    ].join(" "),
  };
}

export function getImageProvider(id: AdsImageProviderId) {
  return imageProviders[id];
}

export function getVideoProvider(id: AdsVideoProviderId) {
  return videoProviders[id];
}

export function getPlatformProvider(platform: AdsPlatform) {
  if (platform === "meta") return metaLiveProvider;
  return metaLiveProvider;
}
