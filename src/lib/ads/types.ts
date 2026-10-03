export type AdsPlatform = "meta";
export type AdsAccountConnectionModel = "customer_owned_meta_account";
export type AdsCreativeFormat = "image" | "video";
export type AdsCampaignStatus =
  | "draft"
  | "ready_for_review"
  | "launch_requested"
  | "active"
  | "paused"
  | "failed";
export type AdsImageProviderId = "openai" | "google" | "mock";
export type AdsVideoProviderId = "openai" | "google" | "mock";

export interface AdsBudgetSplit {
  totalBudgetCents: number;
  mediaSpendCents: number;
  platformFeeCents: number;
}

export interface AdsSettings {
  dailyBudgetCents: number;
  autoLaunch: boolean;
  platformFeePercent: number;
  platform: AdsPlatform;
  accountConnectionModel: AdsAccountConnectionModel;
  creativeFormat: AdsCreativeFormat;
}

export interface AdsResearchSummary {
  id: string;
  title: string;
  excerpt: string;
  updatedAt: string;
}

export interface AdsCreativeAsset {
  id: string;
  kind: "image" | "video";
  title: string;
  prompt: string;
  previewUrl: string | null;
  provider: string;
  model: string;
  status: "generated" | "placeholder";
  notes: string | null;
}

export interface AdsCopyBundle {
  headlines: string[];
  primaryText: string;
  description: string;
  caption: string;
  cta: string;
  audience: string;
  researchSummary: string;
}

export interface AdsCampaign {
  id: string;
  name: string;
  status: AdsCampaignStatus;
  platform: AdsPlatform;
  objective: string;
  targetAudience: string;
  dailyBudgetCents: number;
  mediaSpendCents: number;
  platformFeeCents: number;
  currency: string;
  autoLaunch: boolean;
  accountConnectionModel: AdsAccountConnectionModel;
  creativeFormat: AdsCreativeFormat;
  researchDocumentId: string | null;
  copyBundle: AdsCopyBundle;
  creativeAssets: AdsCreativeAsset[];
  launchNotes: string | null;
  provider: string;
  externalCampaignId: string | null;
  createdAt: string;
  updatedAt: string;
  launchedAt: string | null;
}

export interface AdsDashboardData {
  settings: AdsSettings;
  campaigns: AdsCampaign[];
  latestResearch: AdsResearchSummary | null;
}

export interface AdsProviderOption<T extends string> {
  id: T;
  label: string;
  description: string;
}
