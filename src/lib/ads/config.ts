import type {
  AdsCreativeFormat,
  AdsBudgetSplit,
  AdsImageProviderId,
  AdsSettings,
  AdsVideoProviderId,
} from "@/lib/ads/types";

export const ADS_BUDGET_MIN_CENTS = 1000;
export const ADS_BUDGET_MAX_CENTS = 100000;
export const ADS_BUDGET_STEP_CENTS = 500;
export const ADS_PLATFORM_FEE_PERCENT = 20;

export const DEFAULT_ADS_SETTINGS: AdsSettings = {
  dailyBudgetCents: 14000,
  autoLaunch: true,
  platformFeePercent: ADS_PLATFORM_FEE_PERCENT,
  platform: "meta",
  accountConnectionModel: "customer_owned_meta_account",
  creativeFormat: "image",
};

export const DEFAULT_IMAGE_PROVIDER: AdsImageProviderId = "openai";
export const DEFAULT_VIDEO_PROVIDER: AdsVideoProviderId = "google";

export function buildAdsBudgetSplit(
  totalBudgetCents: number,
  platformFeePercent: number = ADS_PLATFORM_FEE_PERCENT
): AdsBudgetSplit {
  const normalizedBudget = Math.min(
    ADS_BUDGET_MAX_CENTS,
    Math.max(ADS_BUDGET_MIN_CENTS, Math.round(totalBudgetCents))
  );
  const normalizedFeePercent = Math.min(90, Math.max(0, Math.round(platformFeePercent)));
  const platformFeeCents = Math.round((normalizedBudget * normalizedFeePercent) / 100);
  const mediaSpendCents = normalizedBudget - platformFeeCents;

  return {
    totalBudgetCents: normalizedBudget,
    mediaSpendCents,
    platformFeeCents,
  };
}

export function normalizeAdsSettings(raw: Record<string, unknown> | null | undefined): AdsSettings {
  const base = DEFAULT_ADS_SETTINGS;

  return {
    dailyBudgetCents:
      typeof raw?.ads_daily_budget_cents === "number"
        ? raw.ads_daily_budget_cents
        : base.dailyBudgetCents,
    autoLaunch:
      typeof raw?.ads_auto_launch === "boolean"
        ? raw.ads_auto_launch
        : base.autoLaunch,
    platformFeePercent:
      typeof raw?.ads_platform_fee_percent === "number"
        ? raw.ads_platform_fee_percent
        : base.platformFeePercent,
    platform: raw?.ads_platform === "meta" ? raw.ads_platform : base.platform,
    accountConnectionModel:
      raw?.ads_account_connection_model === "customer_owned_meta_account"
        ? raw.ads_account_connection_model
        : base.accountConnectionModel,
    creativeFormat:
      raw?.ads_creative_format === "video" || raw?.ads_creative_format === "image"
        ? raw.ads_creative_format
        : base.creativeFormat,
  };
}

export function serializeAdsSettings(settings: AdsSettings) {
  return {
    ads_daily_budget_cents: settings.dailyBudgetCents,
    ads_auto_launch: settings.autoLaunch,
    ads_platform_fee_percent: settings.platformFeePercent,
    ads_platform: settings.platform,
    ads_account_connection_model: settings.accountConnectionModel,
    ads_creative_format: settings.creativeFormat,
  };
}

export function isAdsCreativeFormat(value: unknown): value is AdsCreativeFormat {
  return value === "image" || value === "video";
}
