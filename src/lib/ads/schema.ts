import type { getCompanyDb } from "@/lib/neon";

type CompanyDb = ReturnType<typeof getCompanyDb>;

export async function ensureAdsSchema(companyDb: CompanyDb) {
  await companyDb`
    CREATE TABLE IF NOT EXISTS ad_campaigns (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      platform TEXT NOT NULL DEFAULT 'meta',
      objective TEXT,
      target_audience TEXT,
      daily_budget_cents INTEGER NOT NULL DEFAULT 0,
      media_spend_cents INTEGER NOT NULL DEFAULT 0,
      platform_fee_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'usd',
      auto_launch BOOLEAN NOT NULL DEFAULT TRUE,
      creative_format TEXT NOT NULL DEFAULT 'image',
      account_connection_model TEXT NOT NULL DEFAULT 'customer_owned_meta_account',
      research_document_id UUID,
      copy_bundle JSONB NOT NULL DEFAULT '{}'::jsonb,
      creative_assets JSONB NOT NULL DEFAULT '[]'::jsonb,
      launch_notes TEXT,
      provider TEXT NOT NULL DEFAULT 'meta_live',
      external_campaign_id TEXT,
      external_adset_id TEXT,
      external_creative_id TEXT,
      external_ad_id TEXT,
      launched_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Add columns that may be missing on existing tables
  await companyDb`
    ALTER TABLE ad_campaigns
    ADD COLUMN IF NOT EXISTS creative_format TEXT NOT NULL DEFAULT 'image'
  `;
  await companyDb`
    ALTER TABLE ad_campaigns
    ADD COLUMN IF NOT EXISTS external_adset_id TEXT
  `;
  await companyDb`
    ALTER TABLE ad_campaigns
    ADD COLUMN IF NOT EXISTS external_creative_id TEXT
  `;
  await companyDb`
    ALTER TABLE ad_campaigns
    ADD COLUMN IF NOT EXISTS external_ad_id TEXT
  `;
}
