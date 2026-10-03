/**
 * Meta Marketing API client.
 *
 * Operates on the customer's own Meta ad account (Artha is added as partner).
 * Uses the stored user access token from the OAuth flow.
 *
 * Reference: https://developers.facebook.com/docs/marketing-apis
 */

const META_GRAPH_BASE = "https://graph.facebook.com/v21.0";

interface MetaApiOptions {
  accessToken: string;
  adAccountId: string; // e.g. "act_123456789"
}

interface MetaCampaignParams {
  name: string;
  objective: string;
  dailyBudgetCents: number;
  status?: "PAUSED" | "ACTIVE";
}

interface MetaAdSetParams {
  campaignId: string;
  name: string;
  dailyBudgetCents: number;
  targetAudience: string;
  startTime?: string;
  optimization?: string;
  billingEvent?: string;
}

interface MetaAdParams {
  adSetId: string;
  name: string;
  creativeId: string;
  status?: "PAUSED" | "ACTIVE";
}

interface MetaAdCreativeParams {
  name: string;
  pageId: string;
  primaryText: string;
  headline: string;
  description: string;
  callToAction: string;
  linkUrl: string;
  imageHash?: string;
  videoId?: string;
}

export interface MetaCampaignResult {
  id: string;
}

export interface MetaAdSetResult {
  id: string;
}

export interface MetaAdResult {
  id: string;
}

export interface MetaAdCreativeResult {
  id: string;
}

export interface MetaImageUploadResult {
  hash: string;
}

export interface MetaCampaignInsights {
  impressions: number;
  clicks: number;
  spend: string; // e.g. "12.34"
  ctr: string;
  cpc: string;
  reach: number;
  conversions: number;
}

export interface MetaAdAccountInfo {
  id: string;
  name: string;
  accountId: string;
  currency: string;
  status: number;
}

// ─── Helpers ──────────────────────────────────────────────────────

async function metaFetch<T>(
  path: string,
  opts: MetaApiOptions,
  init?: RequestInit
): Promise<T> {
  const url = new URL(`${META_GRAPH_BASE}${path}`);
  if (!init || init.method === "GET" || !init.method) {
    url.searchParams.set("access_token", opts.accessToken);
  }

  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      ...init?.headers,
    },
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    const msg = data.error?.message || data.error?.error_user_msg || `Meta API error ${res.status}`;
    throw new MetaApiError(msg, res.status, data.error);
  }

  return data as T;
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public metaError?: Record<string, unknown>
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

// Map our CTA strings to Meta's enum values
const CTA_MAP: Record<string, string> = {
  "start now": "SIGN_UP",
  "sign up": "SIGN_UP",
  "learn more": "LEARN_MORE",
  "get started": "SIGN_UP",
  "shop now": "SHOP_NOW",
  "book now": "BOOK_TRAVEL",
  "contact us": "CONTACT_US",
  "download": "DOWNLOAD",
  "apply now": "APPLY_NOW",
  "subscribe": "SUBSCRIBE",
};

function mapCta(cta: string): string {
  return CTA_MAP[cta.toLowerCase().trim()] || "LEARN_MORE";
}

// Map our objective strings to Meta's campaign objective enum
function mapObjective(objective: string): string {
  const lower = objective.toLowerCase();
  if (lower.includes("lead")) return "OUTCOME_LEADS";
  if (lower.includes("traffic")) return "OUTCOME_TRAFFIC";
  if (lower.includes("awareness") || lower.includes("reach")) return "OUTCOME_AWARENESS";
  if (lower.includes("conversion") || lower.includes("sales")) return "OUTCOME_SALES";
  if (lower.includes("engagement")) return "OUTCOME_ENGAGEMENT";
  if (lower.includes("app")) return "OUTCOME_APP_PROMOTION";
  return "OUTCOME_LEADS"; // default
}

// ─── Ad Account ───────────────────────────────────────────────────

export async function getAdAccountInfo(opts: MetaApiOptions): Promise<MetaAdAccountInfo> {
  return metaFetch<MetaAdAccountInfo>(
    `/${opts.adAccountId}?fields=id,name,account_id,currency,account_status`,
    opts
  );
}

export async function listAdAccounts(
  accessToken: string
): Promise<Array<{ id: string; name: string; account_id: string; currency: string; account_status: number }>> {
  const url = new URL(`${META_GRAPH_BASE}/me/adaccounts`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("fields", "id,name,account_id,currency,account_status");
  url.searchParams.set("limit", "50");

  const res = await fetch(url.toString());
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new MetaApiError(
      data.error?.message || `Failed to list ad accounts: ${res.status}`,
      res.status,
      data.error
    );
  }

  return data.data || [];
}

// ─── Campaign CRUD ────────────────────────────────────────────────

export async function createCampaign(
  opts: MetaApiOptions,
  params: MetaCampaignParams
): Promise<MetaCampaignResult> {
  const body = new URLSearchParams({
    access_token: opts.accessToken,
    name: params.name,
    objective: mapObjective(params.objective),
    status: params.status || "PAUSED",
    special_ad_categories: "[]",
  });

  return metaFetch<MetaCampaignResult>(`/${opts.adAccountId}/campaigns`, opts, {
    method: "POST",
    body,
  });
}

export async function updateCampaignStatus(
  opts: MetaApiOptions,
  campaignId: string,
  status: "ACTIVE" | "PAUSED" | "DELETED"
): Promise<{ success: boolean }> {
  const body = new URLSearchParams({
    access_token: opts.accessToken,
    status,
  });

  return metaFetch<{ success: boolean }>(`/${campaignId}`, opts, {
    method: "POST",
    body,
  });
}

// ─── Ad Set ───────────────────────────────────────────────────────

export async function createAdSet(
  opts: MetaApiOptions,
  params: MetaAdSetParams
): Promise<MetaAdSetResult> {
  const body = new URLSearchParams({
    access_token: opts.accessToken,
    name: params.name,
    campaign_id: params.campaignId,
    daily_budget: String(params.dailyBudgetCents), // Meta uses cents
    billing_event: params.billingEvent || "IMPRESSIONS",
    optimization_goal: params.optimization || "LEAD_GENERATION",
    start_time: params.startTime || new Date().toISOString(),
    status: "PAUSED",
    targeting: JSON.stringify({
      geo_locations: { countries: ["US"] },
      age_min: 18,
      age_max: 65,
    }),
  });

  return metaFetch<MetaAdSetResult>(`/${opts.adAccountId}/adsets`, opts, {
    method: "POST",
    body,
  });
}

// ─── Ad Creative ──────────────────────────────────────────────────

export async function uploadImage(
  opts: MetaApiOptions,
  imageUrl: string
): Promise<MetaImageUploadResult> {
  const body = new URLSearchParams({
    access_token: opts.accessToken,
    url: imageUrl,
  });

  const result = await metaFetch<{ images: Record<string, { hash: string }> }>(
    `/${opts.adAccountId}/adimages`,
    opts,
    { method: "POST", body }
  );

  const firstKey = Object.keys(result.images)[0];
  return { hash: result.images[firstKey].hash };
}

export async function createAdCreative(
  opts: MetaApiOptions,
  params: MetaAdCreativeParams
): Promise<MetaAdCreativeResult> {
  const linkData: Record<string, unknown> = {
    message: params.primaryText,
    name: params.headline,
    description: params.description,
    link: params.linkUrl,
    call_to_action: { type: mapCta(params.callToAction) },
  };

  if (params.imageHash) {
    linkData.image_hash = params.imageHash;
  }
  if (params.videoId) {
    linkData.video_id = params.videoId;
  }

  const body = new URLSearchParams({
    access_token: opts.accessToken,
    name: params.name,
    object_story_spec: JSON.stringify({
      page_id: params.pageId,
      link_data: linkData,
    }),
  });

  return metaFetch<MetaAdCreativeResult>(`/${opts.adAccountId}/adcreatives`, opts, {
    method: "POST",
    body,
  });
}

// ─── Ad ───────────────────────────────────────────────────────────

export async function createAd(
  opts: MetaApiOptions,
  params: MetaAdParams
): Promise<MetaAdResult> {
  const body = new URLSearchParams({
    access_token: opts.accessToken,
    name: params.name,
    adset_id: params.adSetId,
    creative: JSON.stringify({ creative_id: params.creativeId }),
    status: params.status || "PAUSED",
  });

  return metaFetch<MetaAdResult>(`/${opts.adAccountId}/ads`, opts, {
    method: "POST",
    body,
  });
}

// ─── Insights ─────────────────────────────────────────────────────

export async function getCampaignInsights(
  opts: MetaApiOptions,
  campaignId: string,
  datePreset: string = "last_7d"
): Promise<MetaCampaignInsights | null> {
  const url = new URL(`${META_GRAPH_BASE}/${campaignId}/insights`);
  url.searchParams.set("access_token", opts.accessToken);
  url.searchParams.set("fields", "impressions,clicks,spend,ctr,cpc,reach,actions");
  url.searchParams.set("date_preset", datePreset);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (!res.ok || data.error) {
    // Insights may not exist yet for new campaigns
    if (data.error?.code === 100) return null;
    throw new MetaApiError(
      data.error?.message || `Insights fetch failed: ${res.status}`,
      res.status,
      data.error
    );
  }

  if (!data.data || data.data.length === 0) return null;

  const row = data.data[0];
  const leadActions = (row.actions || []).find(
    (a: Record<string, string>) => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped"
  );

  return {
    impressions: Number(row.impressions || 0),
    clicks: Number(row.clicks || 0),
    spend: row.spend || "0",
    ctr: row.ctr || "0",
    cpc: row.cpc || "0",
    reach: Number(row.reach || 0),
    conversions: Number(leadActions?.value || 0),
  };
}

// ─── Full Campaign Launch ─────────────────────────────────────────

export interface FullLaunchParams {
  accessToken: string;
  adAccountId: string;
  pageId: string;
  campaignName: string;
  objective: string;
  dailyBudgetCents: number;
  mediaSpendCents: number;
  targetAudience: string;
  primaryText: string;
  headline: string;
  description: string;
  cta: string;
  linkUrl: string;
  imageUrl?: string;
}

export interface FullLaunchResult {
  campaignId: string;
  adSetId: string;
  adCreativeId: string;
  adId: string;
}

/**
 * Creates the full Meta campaign hierarchy:
 * Campaign → Ad Set → Ad Creative → Ad
 *
 * All objects are created in PAUSED state so the user can review in
 * Meta Ads Manager before activating.
 */
export async function launchFullCampaign(params: FullLaunchParams): Promise<FullLaunchResult> {
  const opts: MetaApiOptions = {
    accessToken: params.accessToken,
    adAccountId: params.adAccountId,
  };

  // 1. Create campaign
  const campaign = await createCampaign(opts, {
    name: params.campaignName,
    objective: params.objective,
    dailyBudgetCents: params.dailyBudgetCents,
    status: "PAUSED",
  });

  // 2. Create ad set with media spend budget
  const adSet = await createAdSet(opts, {
    campaignId: campaign.id,
    name: `${params.campaignName} – Ad Set`,
    dailyBudgetCents: params.mediaSpendCents,
    targetAudience: params.targetAudience,
  });

  // 3. Upload image if provided
  let imageHash: string | undefined;
  if (params.imageUrl && !params.imageUrl.startsWith("data:")) {
    try {
      const upload = await uploadImage(opts, params.imageUrl);
      imageHash = upload.hash;
    } catch {
      // Continue without image — creative will be text-only
    }
  }

  // 4. Create ad creative
  const creative = await createAdCreative(opts, {
    name: `${params.campaignName} – Creative`,
    pageId: params.pageId,
    primaryText: params.primaryText,
    headline: params.headline,
    description: params.description,
    callToAction: params.cta,
    linkUrl: params.linkUrl,
    imageHash,
  });

  // 5. Create ad
  const ad = await createAd(opts, {
    adSetId: adSet.id,
    name: `${params.campaignName} – Ad`,
    creativeId: creative.id,
    status: "PAUSED",
  });

  return {
    campaignId: campaign.id,
    adSetId: adSet.id,
    adCreativeId: creative.id,
    adId: ad.id,
  };
}

/**
 * Activate a campaign (set campaign + all ad sets + all ads to ACTIVE).
 */
export async function activateCampaign(
  opts: MetaApiOptions,
  campaignId: string
): Promise<void> {
  await updateCampaignStatus(opts, campaignId, "ACTIVE");
}
