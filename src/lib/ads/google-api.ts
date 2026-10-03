// ══════════════════════════════════════════════════════════════════════
// Google Ads API client — stub for future integration
// TODO: Replace mock implementations with real Google Ads API calls
//       once credentials and developer token are provisioned.
// Docs: https://developers.google.com/google-ads/api/docs/start
// ══════════════════════════════════════════════════════════════════════

// ── Types ────────────────────────────────────────────────────────────

export interface GoogleAdsCampaign {
  id: string;
  name: string;
  status: "enabled" | "paused" | "removed";
  budget: { amountMicros: number; deliveryMethod: "standard" | "accelerated" };
  startDate: string;
  endDate?: string;
  targetLocations: string[];
  keywords: string[];
  adGroupCount: number;
}

export interface KeywordSuggestion {
  keyword: string;
  avgMonthlySearches: number;
  competitionLevel: "low" | "medium" | "high";
  suggestedBidMicros: number;
  relevanceScore: number;
}

export interface CampaignPerformance {
  campaignId: string;
  dateRange: { start: string; end: string };
  impressions: number;
  clicks: number;
  ctr: number;
  avgCpc: number;
  conversions: number;
  costMicros: number;
}

interface SearchCampaignConfig {
  name: string;
  budgetAmountMicros: number;
  keywords: string[];
  targetLocations?: string[];
  startDate?: string;
  endDate?: string;
}

// ── Stub implementations ─────────────────────────────────────────────

/**
 * Creates a Google search campaign.
 * TODO: Integrate with Google Ads API CustomerService.mutate
 */
export async function createSearchCampaign(config: SearchCampaignConfig): Promise<GoogleAdsCampaign> {
  // TODO: Replace with real Google Ads API call
  // const client = new GoogleAdsApi({ client_id, client_secret, developer_token });
  // const customer = client.Customer({ customer_id, refresh_token });
  // return customer.campaigns.create(...)

  return {
    id: `mock-campaign-${Date.now()}`,
    name: config.name,
    status: "paused",
    budget: { amountMicros: config.budgetAmountMicros, deliveryMethod: "standard" },
    startDate: config.startDate ?? new Date().toISOString().split("T")[0],
    endDate: config.endDate,
    targetLocations: config.targetLocations ?? ["US"],
    keywords: config.keywords,
    adGroupCount: 1,
  };
}

/**
 * Returns keyword ideas based on a seed keyword.
 * TODO: Integrate with Google Ads API KeywordPlanIdeaService
 */
export async function getKeywordSuggestions(seed: string): Promise<KeywordSuggestion[]> {
  // TODO: Replace with real Google Ads API call
  // const keywordPlanService = customer.keywordPlanIdeas;
  // return keywordPlanService.generateKeywordIdeas({ keyword_seed: { keywords: [seed] } })

  const mockSuffixes = ["software", "tools", "platform", "service", "app"];

  return mockSuffixes.map((suffix, i) => ({
    keyword: `${seed} ${suffix}`,
    avgMonthlySearches: Math.floor(Math.random() * 10000) + 500,
    competitionLevel: (["low", "medium", "high"] as const)[i % 3],
    suggestedBidMicros: Math.floor(Math.random() * 5_000_000) + 500_000,
    relevanceScore: Math.round((0.95 - i * 0.1) * 100) / 100,
  }));
}

/**
 * Returns performance metrics for a campaign.
 * TODO: Integrate with Google Ads API GoogleAdsService.searchStream
 */
export async function getCampaignPerformance(campaignId: string): Promise<CampaignPerformance> {
  // TODO: Replace with real Google Ads API call
  // const query = `SELECT campaign.id, metrics.impressions, ... FROM campaign WHERE campaign.id = ${campaignId}`;
  // return customer.query(query)

  const impressions = Math.floor(Math.random() * 50000) + 1000;
  const clicks = Math.floor(impressions * (Math.random() * 0.05 + 0.01));
  const conversions = Math.floor(clicks * (Math.random() * 0.1 + 0.02));

  return {
    campaignId,
    dateRange: {
      start: new Date(Date.now() - 30 * 86400_000).toISOString().split("T")[0],
      end: new Date().toISOString().split("T")[0],
    },
    impressions,
    clicks,
    ctr: clicks / impressions,
    avgCpc: Math.round(Math.random() * 300 + 50) / 100,
    conversions,
    costMicros: clicks * (Math.floor(Math.random() * 3_000_000) + 500_000),
  };
}
