CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
  CREATE TYPE project_status AS ENUM ('onboarding', 'active', 'paused');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE subscription_status AS ENUM ('none', 'active', 'cancelled', 'past_due', 'paused', 'trialing');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE job_status AS ENUM ('pending', 'running', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE revenue_type AS ENUM ('income', 'withdrawal');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE revenue_status AS ENUM ('pending', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  avatar_url TEXT,
  google_id TEXT UNIQUE,
  google_data JSONB DEFAULT '{}'::jsonb,
  stripe_customer_id TEXT,
  stripe_connect_account_id TEXT,
  paypal_payout_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS paypal_payout_email TEXT,
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS waitlist_signups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'landing_page',
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE waitlist_signups
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS email_normalized TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'landing_page',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE waitlist_signups
  ALTER COLUMN name DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_signups_email_normalized
  ON waitlist_signups(email_normalized);
CREATE INDEX IF NOT EXISTS idx_waitlist_signups_status
  ON waitlist_signups(status, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status project_status DEFAULT 'onboarding' NOT NULL,
  subscription_status subscription_status DEFAULT 'none' NOT NULL,
  stripe_subscription_id TEXT,
  neon_project_id TEXT,
  neon_connection_url TEXT,
  github_repo_url TEXT,
  github_repo_full_name TEXT,
  company_email TEXT,
  email_setup_status TEXT DEFAULT 'pending',
  email_setup_error TEXT,
  landing_page_html TEXT,
  landing_page_published BOOLEAN DEFAULT FALSE,
  first_tweet_url TEXT,
  tweet_setup_status TEXT DEFAULT 'pending',
  tweet_setup_error TEXT,
  cloudflare_setup_status TEXT DEFAULT 'pending',
  cloudflare_setup_error TEXT,
  memory JSONB DEFAULT '{}'::jsonb,
  task_credits INTEGER DEFAULT 0,
  revenue_balance_cents INTEGER DEFAULT 0,
  marketplace_enabled BOOLEAN DEFAULT FALSE,
  marketplace_fee_percent INTEGER DEFAULT 20,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS task_credits INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_tweet_url TEXT,
  ADD COLUMN IF NOT EXISTS email_setup_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS email_setup_error TEXT,
  ADD COLUMN IF NOT EXISTS tweet_setup_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS tweet_setup_error TEXT,
  ADD COLUMN IF NOT EXISTS marketplace_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS marketplace_fee_percent INTEGER DEFAULT 20,
  ADD COLUMN IF NOT EXISTS last_nudge_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cloudflare_setup_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS cloudflare_setup_error TEXT,
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_subscription_broadcast_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE;

-- Migrate task_credits from INTEGER to NUMERIC for fractional credit support (0.5, 1.5)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects'
      AND column_name = 'task_credits'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE projects ALTER COLUMN task_credits TYPE NUMERIC(10,1)
      USING COALESCE(task_credits, 0)::NUMERIC(10,1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

CREATE TABLE IF NOT EXISTS platform_email_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_email TEXT NOT NULL,
  sender_email_normalized TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  awaiting_project_clarification BOOLEAN DEFAULT FALSE,
  pending_subject TEXT,
  pending_body_text TEXT,
  pending_body_html TEXT,
  last_message_id TEXT,
  last_outbound_message_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE platform_email_threads
  ADD COLUMN IF NOT EXISTS sender_email TEXT,
  ADD COLUMN IF NOT EXISTS sender_email_normalized TEXT,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS awaiting_project_clarification BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pending_subject TEXT,
  ADD COLUMN IF NOT EXISTS pending_body_text TEXT,
  ADD COLUMN IF NOT EXISTS pending_body_html TEXT,
  ADD COLUMN IF NOT EXISTS last_message_id TEXT,
  ADD COLUMN IF NOT EXISTS last_outbound_message_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_platform_email_threads_sender
  ON platform_email_threads(sender_email_normalized, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_email_threads_user
  ON platform_email_threads(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS platform_email_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID REFERENCES platform_email_threads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  message_id TEXT,
  in_reply_to TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE platform_email_messages
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES platform_email_threads(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS direction TEXT,
  ADD COLUMN IF NOT EXISTS from_email TEXT,
  ADD COLUMN IF NOT EXISTS to_email TEXT,
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS body_text TEXT,
  ADD COLUMN IF NOT EXISTS body_html TEXT,
  ADD COLUMN IF NOT EXISTS message_id TEXT,
  ADD COLUMN IF NOT EXISTS in_reply_to TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_platform_email_messages_thread
  ON platform_email_messages(thread_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_email_messages_message_id
  ON platform_email_messages(message_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_project ON subscriptions(project_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);

CREATE TABLE IF NOT EXISTS job_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  status job_status DEFAULT 'pending' NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON job_queue(status, created_at);

CREATE TABLE IF NOT EXISTS pipeline_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES job_queue(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL,
  log_message TEXT,
  log_type TEXT DEFAULT 'info',
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pipeline_events_job ON pipeline_events(job_id, created_at);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_event_id TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  livemode BOOLEAN NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS revenue_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type revenue_type NOT NULL,
  amount_cents INTEGER NOT NULL,
  description TEXT,
  stripe_transfer_id TEXT,
  gross_amount_cents INTEGER,
  platform_fee_cents INTEGER DEFAULT 0,
  seller_net_amount_cents INTEGER,
  currency TEXT DEFAULT 'usd',
  external_payout_method TEXT,
  external_payout_email TEXT,
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  stripe_subscription_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  status revenue_status DEFAULT 'pending' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE revenue_transactions
  ADD COLUMN IF NOT EXISTS gross_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_net_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'usd',
  ADD COLUMN IF NOT EXISTS external_payout_method TEXT,
  ADD COLUMN IF NOT EXISTS external_payout_email TEXT,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_revenue_project ON revenue_transactions(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_transactions_checkout_session
  ON revenue_transactions(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_transactions_invoice_id
  ON revenue_transactions(stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS site_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event TEXT NOT NULL DEFAULT 'pageview',
  path TEXT DEFAULT '/',
  visitor_id TEXT,
  session_id TEXT,
  referrer TEXT,
  user_agent TEXT,
  screen_width INTEGER,
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add columns for existing tables (idempotent migration)
ALTER TABLE site_analytics ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE site_analytics ADD COLUMN IF NOT EXISTS screen_width INTEGER;
ALTER TABLE site_analytics ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

CREATE INDEX IF NOT EXISTS idx_site_analytics_project ON site_analytics(project_id);
CREATE INDEX IF NOT EXISTS idx_site_analytics_created ON site_analytics(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_site_analytics_event ON site_analytics(project_id, event);
CREATE INDEX IF NOT EXISTS idx_site_analytics_session ON site_analytics(project_id, session_id);
CREATE INDEX IF NOT EXISTS idx_site_analytics_path ON site_analytics(project_id, path);

CREATE TABLE IF NOT EXISTS project_pricing_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  public_id TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  billing_interval TEXT NOT NULL DEFAULT 'month',
  interval_count INTEGER NOT NULL DEFAULT 1,
  cta_text TEXT,
  features JSONB DEFAULT '[]'::jsonb,
  active BOOLEAN DEFAULT TRUE NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT project_pricing_plans_interval_check
    CHECK (billing_interval IN ('month', 'year', 'one_time')),
  CONSTRAINT project_pricing_plans_interval_count_check
    CHECK (interval_count > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_pricing_plans_project_slug
  ON project_pricing_plans(project_id, slug);
CREATE INDEX IF NOT EXISTS idx_project_pricing_plans_project_active
  ON project_pricing_plans(project_id, active, sort_order);

-- Credits awarded to site users upon purchase/subscription of this plan
ALTER TABLE project_pricing_plans ADD COLUMN IF NOT EXISTS credit_amount INTEGER DEFAULT 0;

-- Marketplace subscribers (end-customers who buy through company websites)
CREATE TABLE IF NOT EXISTS marketplace_subscribers (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id              UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email                   TEXT NOT NULL,
  name                    TEXT,
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  plan_id                 UUID REFERENCES project_pricing_plans(id) ON DELETE SET NULL,
  plan_name               TEXT,
  status                  TEXT NOT NULL DEFAULT 'active',
  amount_cents            INTEGER,
  currency                TEXT DEFAULT 'usd',
  billing_interval        TEXT,
  current_period_end      TIMESTAMPTZ,
  subscribed_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  canceled_at             TIMESTAMPTZ,
  metadata                JSONB DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at              TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT marketplace_subscribers_status_check
    CHECK (status IN ('active', 'past_due', 'canceled', 'one_time'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_subs_project_email_plan
  ON marketplace_subscribers(project_id, email, plan_id);
CREATE INDEX IF NOT EXISTS idx_mkt_subs_project
  ON marketplace_subscribers(project_id);
CREATE INDEX IF NOT EXISTS idx_mkt_subs_stripe_sub
  ON marketplace_subscribers(stripe_subscription_id);

-- ── Milestones (revenue celebrations and social proof) ──
CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,            -- 'first_sale', 'revenue_100', 'revenue_1000', 'subscriber_10'
  title TEXT NOT NULL,
  amount_cents INTEGER,
  is_public BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, type)
);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);

CREATE OR REPLACE FUNCTION decrement_task_credits(p_project_id UUID, p_amount NUMERIC DEFAULT 1)
RETURNS VOID AS $$
BEGIN
  UPDATE projects
  SET task_credits = GREATEST(COALESCE(task_credits, 0) - p_amount, 0)
  WHERE id = p_project_id AND COALESCE(task_credits, 0) >= p_amount;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- DASHBOARD DATA TABLES (moved from per-company isolated DBs)
-- All scoped by project_id. Cascade delete when project is removed.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Company Profile ──
CREATE TABLE IF NOT EXISTS company_profile (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tagline TEXT,
  domain TEXT,
  founder_role TEXT,
  settings JSONB DEFAULT '{}'::jsonb,
  UNIQUE(project_id)
);
CREATE INDEX IF NOT EXISTS idx_company_profile_project ON company_profile(project_id);

-- ── Documents ──
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);

-- ── Tasks ──
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  priority INTEGER DEFAULT 0,
  prompt TEXT,
  result TEXT,
  summary TEXT,
  credits_cost INTEGER DEFAULT 1,
  is_recurring BOOLEAN DEFAULT FALSE,
  source TEXT DEFAULT 'system',
  tag TEXT,
  agent TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(project_id, status);

-- revenue_impact: 'direct' (generates revenue), 'pipeline' (builds towards revenue), 'brand' (awareness)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS revenue_impact TEXT;

-- ── Chat Messages ──
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'chat',
  task_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_project ON chat_messages(project_id);

-- ── Pages (website HTML stored on platform) ──
CREATE TABLE IF NOT EXISTS pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT,
  html TEXT,
  css TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_pages_project ON pages(project_id);

-- ── Memory (key-value store per project) ──
CREATE TABLE IF NOT EXISTS memory (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB,
  PRIMARY KEY (project_id, key)
);

-- ── Leads ──
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  linkedin_url TEXT,
  company TEXT,
  role TEXT,
  phone TEXT,
  website TEXT,
  source TEXT,
  source_research_id UUID,
  score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'new',
  contacted BOOLEAN DEFAULT FALSE,
  contacted_at TIMESTAMPTZ,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_project ON leads(project_id);

-- ── Research Tags ──
CREATE TABLE IF NOT EXISTS research_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_research_tags_project ON research_tags(project_id);

-- ── Email Campaigns ──
CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT,
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  status TEXT DEFAULT 'draft',
  sent_count INTEGER DEFAULT 0,
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_project ON email_campaigns(project_id);

-- ── Email Sends ──
CREATE TABLE IF NOT EXISTS email_sends (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  campaign_id UUID,
  contact_id UUID,
  to_email TEXT NOT NULL,
  status TEXT DEFAULT 'queued',
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_email_sends_project ON email_sends(project_id);

-- ── Email Inbound ──
CREATE TABLE IF NOT EXISTS email_inbound (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_email TEXT NOT NULL,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  message_id TEXT,
  processed BOOLEAN DEFAULT FALSE,
  task_id UUID,
  received_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_inbound_project ON email_inbound(project_id);

-- ── Email Threads (per-project company email threads) ──
CREATE TABLE IF NOT EXISTS email_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  participants TEXT[] DEFAULT '{}',
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,
  is_read BOOLEAN DEFAULT FALSE,
  snippet TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_threads_project ON email_threads(project_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_last_msg ON email_threads(project_id, last_message_at DESC);

-- ── Email Messages (per-project company email messages) ──
CREATE TABLE IF NOT EXISTS email_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  thread_id UUID,
  direction TEXT NOT NULL,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  message_id TEXT,
  in_reply_to TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_messages_project ON email_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_thread ON email_messages(project_id, thread_id);

-- ── Analytics (per-project dashboard analytics) ──
CREATE TABLE IF NOT EXISTS analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  page TEXT,
  visitor_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_project ON analytics(project_id);

-- ── Tweets ──
CREATE TABLE IF NOT EXISTS tweets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  thread_id TEXT,
  tweet_id TEXT,
  tweet_url TEXT,
  type TEXT DEFAULT 'launch',
  status TEXT DEFAULT 'draft',
  posted_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE tweets ADD COLUMN IF NOT EXISTS tweet_url TEXT;
ALTER TABLE tweets ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'launch';
CREATE INDEX IF NOT EXISTS idx_tweets_project ON tweets(project_id);

-- ── Ad Campaigns ──
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
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
  provider TEXT NOT NULL DEFAULT 'meta_partner_manual',
  external_campaign_id TEXT,
  launched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_project ON ad_campaigns(project_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SIMPLE WEBSITE DATA (always free, no subscription required)
-- Contacts & forms stored in platform DB so free users can collect leads.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Contacts ──
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  source TEXT DEFAULT 'form',
  form_slug TEXT,
  page_slug TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  subscribed BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, email)
);
CREATE INDEX IF NOT EXISTS idx_contacts_project ON contacts(project_id);

-- ── Forms ──
CREATE TABLE IF NOT EXISTS forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  page_slug TEXT,
  title TEXT,
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  redirect_url TEXT,
  notify_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_forms_project ON forms(project_id);

-- ── Form Submissions ──
CREATE TABLE IF NOT EXISTS form_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  form_slug TEXT NOT NULL,
  contact_id UUID,
  data JSONB NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_form_submissions_project ON form_submissions(project_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- WEBSITE DB LIFECYCLE SUPPORT
-- ═══════════════════════════════════════════════════════════════════════════

-- Schema backup for hibernated website DBs (saved on cancel/payment failure)
CREATE TABLE IF NOT EXISTS saved_website_schemas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  schema_sql TEXT NOT NULL,
  table_definitions JSONB NOT NULL,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id)
);

-- Add website DB lifecycle columns to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS website_db_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_deletion_warning_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS website_db_storage_bytes BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS website_db_overage_credits NUMERIC(10,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS file_storage_bytes BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS file_storage_overage_credits NUMERIC(10,1) DEFAULT 0;

-- Migrate from old cents column to credits column
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'website_db_overage_cents') THEN
    ALTER TABLE projects DROP COLUMN website_db_overage_cents;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES FOR /live DASHBOARD
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_pipeline_events_created
  ON pipeline_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_running
  ON tasks(status, started_at DESC) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_tweets_posted
  ON tweets(posted_at DESC) WHERE status = 'posted';
CREATE INDEX IF NOT EXISTS idx_documents_created
  ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_completed_income
  ON revenue_transactions(created_at)
  WHERE type = 'income' AND status = 'completed';

-- ═══════════════════════════════════════════════════════════════════════════
-- TWITTER GROWTH BOT
-- Tracks all automated tweets posted by the agents @tryarthaHQ.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS twitter_bot_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL,                -- 'showcase', 'tip', 'thread', 'article'
  tweet_ids TEXT[] DEFAULT '{}',         -- array of tweet IDs (multiple for threads)
  tweet_urls TEXT[] DEFAULT '{}',
  content TEXT NOT NULL,                 -- full text (JSON stringified for threads)
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,  -- for showcase tweets
  status TEXT DEFAULT 'draft',           -- 'draft', 'posted', 'failed'
  error TEXT,
  topic TEXT,                            -- short topic label for dedup
  metadata JSONB DEFAULT '{}'::jsonb,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_twitter_bot_category ON twitter_bot_posts(category, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_twitter_bot_status ON twitter_bot_posts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_twitter_bot_project ON twitter_bot_posts(project_id);

-- Auto-reply engine: tracks every incoming reply we process (replied or skipped)
CREATE TABLE IF NOT EXISTS twitter_bot_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_post_id UUID REFERENCES twitter_bot_posts(id) ON DELETE SET NULL,
  source_tweet_id TEXT NOT NULL,              -- our original tweet that received the reply
  reply_tweet_id TEXT NOT NULL UNIQUE,        -- the external user's reply tweet ID
  reply_author_id TEXT NOT NULL,              -- Twitter user ID of the replier
  reply_author_username TEXT,                 -- @handle of the replier
  reply_text TEXT NOT NULL,                   -- text of the incoming reply
  reply_verified BOOLEAN DEFAULT FALSE,       -- is the replier verified
  our_response_tweet_id TEXT,                 -- our auto-reply tweet ID (null if skipped)
  our_response_text TEXT,                     -- text we replied with
  our_response_url TEXT,                      -- URL of our reply
  decision TEXT NOT NULL,                     -- 'reply', 'skip', 'error'
  decision_reason TEXT,                       -- AI's reasoning for the decision
  platform TEXT NOT NULL DEFAULT 'twitter',   -- 'twitter' or 'bluesky'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  replied_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bot_replies_source ON twitter_bot_replies(source_tweet_id);
CREATE INDEX IF NOT EXISTS idx_bot_replies_reply ON twitter_bot_replies(reply_tweet_id);
CREATE INDEX IF NOT EXISTS idx_bot_replies_decision ON twitter_bot_replies(decision, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_replies_platform ON twitter_bot_replies(platform, created_at DESC);

-- ── Outbound engagement tracking (proactive replies to strangers' posts) ──
CREATE TABLE IF NOT EXISTS outbound_engagements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform TEXT NOT NULL,                    -- 'twitter', 'bluesky', 'reddit'
  source_post_id TEXT NOT NULL,              -- external post/tweet ID we're replying to
  source_post_url TEXT,                      -- URL of the original post
  source_author_id TEXT,                     -- author's platform user ID
  source_author_username TEXT,               -- @handle or username
  source_text TEXT NOT NULL,                 -- text of the post we found
  search_keyword TEXT,                       -- which keyword matched
  relevance_score REAL,                      -- AI-assigned 0-1 score
  decision TEXT NOT NULL,                    -- 'reply', 'skip', 'manual', 'error'
  decision_reason TEXT,                      -- AI reasoning
  our_reply_text TEXT,                       -- generated reply text
  our_reply_id TEXT,                         -- our reply's post ID (null if manual/skip)
  our_reply_url TEXT,                        -- URL of our reply
  metadata JSONB DEFAULT '{}',              -- extra platform-specific data
  created_at TIMESTAMPTZ DEFAULT NOW(),
  replied_at TIMESTAMPTZ,
  UNIQUE(platform, source_post_id)           -- dedup: one engagement per post
);
CREATE INDEX IF NOT EXISTS idx_outbound_platform ON outbound_engagements(platform, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_author ON outbound_engagements(source_author_username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_decision ON outbound_engagements(decision, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- AUTONOMY FEATURES: recurring tasks, sequences, content calendar, etc.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Recurring task fields ──
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_interval TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_count INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS external_cron_job_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_tasks_recurring ON tasks(project_id, is_recurring, status, next_run_at)
  WHERE is_recurring = TRUE;

-- ── Inbound email auto-reply tracking ──
ALTER TABLE email_inbound ADD COLUMN IF NOT EXISTS auto_reply_status TEXT DEFAULT 'pending';
ALTER TABLE email_inbound ADD COLUMN IF NOT EXISTS auto_reply_message_id TEXT;

-- ── Analytics review tracking ──
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_analytics_review_at TIMESTAMPTZ;

-- ── Email Follow-Up Sequences ──
CREATE TABLE IF NOT EXISTS email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_sequences_project ON email_sequences(project_id);

CREATE TABLE IF NOT EXISTS sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL,
  current_step INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',
  last_sent_at TIMESTAMPTZ,
  next_send_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sequence_id, lead_id)
);
CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_active
  ON sequence_enrollments(project_id, status, next_send_at)
  WHERE status = 'active';

-- ── Content Calendar ──
CREATE TABLE IF NOT EXISTS content_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'twitter',
  content TEXT NOT NULL,
  media_urls TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'scheduled',
  scheduled_at TIMESTAMPTZ NOT NULL,
  posted_at TIMESTAMPTZ,
  external_id TEXT,
  external_url TEXT,
  error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_content_calendar_project ON content_calendar(project_id);
CREATE INDEX IF NOT EXISTS idx_content_calendar_schedule
  ON content_calendar(project_id, status, scheduled_at)
  WHERE status = 'scheduled';

-- ── Chat Widget Conversations ──
CREATE TABLE IF NOT EXISTS chat_widget_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cwc_project ON chat_widget_conversations(project_id);

CREATE TABLE IF NOT EXISTS chat_widget_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_widget_conversations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cwm_conversation ON chat_widget_messages(conversation_id, created_at);

-- ── Competitors ──
CREATE TABLE IF NOT EXISTS competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  last_snapshot TEXT,
  last_checked_at TIMESTAMPTZ,
  changes_detected INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_competitors_project ON competitors(project_id);

CREATE TABLE IF NOT EXISTS competitor_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  change_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_competitor_alerts_project ON competitor_alerts(project_id);

-- ── SEO Reports ──
CREATE TABLE IF NOT EXISTS seo_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  keywords JSONB DEFAULT '[]'::jsonb,
  meta_suggestions JSONB DEFAULT '{}'::jsonb,
  content_gaps JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_seo_reports_project ON seo_reports(project_id);

-- ── Social Connections (multi-channel) ──
CREATE TABLE IF NOT EXISTS social_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  account_id TEXT,
  account_name TEXT,
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, platform)
);

-- ── A/B Tests ──
CREATE TABLE IF NOT EXISTS ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_slug TEXT NOT NULL,
  variant_a_html TEXT NOT NULL,
  variant_b_html TEXT NOT NULL,
  traffic_split NUMERIC(3,2) DEFAULT 0.50,
  status TEXT DEFAULT 'running',
  winner TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  min_visitors INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ab_tests_project ON ab_tests(project_id, status);

CREATE TABLE IF NOT EXISTS ab_test_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  converted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(test_id, visitor_id)
);

-- ── Churn Events ──
CREATE TABLE IF NOT EXISTS churn_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subscriber_id UUID,
  event_type TEXT NOT NULL,
  email TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_churn_events_project ON churn_events(project_id);

-- ── Team Collaboration ──
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  invited_by UUID REFERENCES users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);

CREATE TABLE IF NOT EXISTS project_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email message tracking metadata (opens, bounces, delivery)
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Referral system
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referrer_project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL UNIQUE,
  referred_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  referred_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending',
  credits_awarded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id);

-- Add referral_code to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES users(id);

-- ═══════════════════════════════════════════════════════════════════════════
-- ARTHA OPS: Autonomous agents that run Artha's own business
-- ═══════════════════════════════════════════════════════════════════════════

-- Tracks every ops agent execution for auditing and the public showcase
CREATE TABLE IF NOT EXISTS artha_ops_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  input JSONB,
  output JSONB,
  actions_taken JSONB DEFAULT '[]'::jsonb,
  tokens_used INTEGER DEFAULT 0,
  cost_usd NUMERIC(10,4) DEFAULT 0,
  duration_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_artha_ops_runs_agent ON artha_ops_runs(agent_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artha_ops_runs_status ON artha_ops_runs(status) WHERE status = 'running';

-- Human-in-the-loop approval queue for high-stakes agent actions
CREATE TABLE IF NOT EXISTS artha_ops_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES artha_ops_runs(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artha_ops_approvals_pending ON artha_ops_approvals(status) WHERE status = 'pending';

-- Support tickets tracked by the support agent
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  channel TEXT NOT NULL,
  messages JSONB DEFAULT '[]'::jsonb,
  agent_confidence NUMERIC(3,2),
  escalated_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status) WHERE status IN ('open', 'escalated');
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);

-- Daily budget tracking for ops agents (circuit breaker)
CREATE TABLE IF NOT EXISTS artha_ops_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  tokens_used INTEGER DEFAULT 0,
  cost_usd NUMERIC(10,4) DEFAULT 0,
  runs_count INTEGER DEFAULT 0,
  budget_limit_usd NUMERIC(10,4) NOT NULL DEFAULT 1.00,
  UNIQUE(agent_name, date)
);

CREATE INDEX IF NOT EXISTS idx_artha_ops_budgets_date ON artha_ops_budgets(date, agent_name);

-- ═══════════════════════════════════════════════════════════════════════════
-- BLOG POSTS
-- Auto-published blog content for artha.run SEO and thought leadership.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  seo_title TEXT,
  seo_description TEXT,
  source_type TEXT,
  source_tweet_post_id UUID REFERENCES twitter_bot_posts(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts (status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts (slug);

-- Email unsubscribe preferences
CREATE TABLE IF NOT EXISTS email_unsubscribes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_type TEXT NOT NULL, -- 'all', 'digest', 'nudge', 'marketing', 'weekly_summary'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_unsub_user_type
  ON email_unsubscribes (user_id, email_type);

-- Add unsubscribe_token to users for one-click unsubscribe (no login required)
ALTER TABLE users ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT;

-- ── AI Everywhere: Morning Briefing Cache ──
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_briefing JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_briefing_at TIMESTAMPTZ;

-- ── AI Everywhere: Automation Rules ──
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB DEFAULT '{}',
  action_type TEXT NOT NULL,
  action_config JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_automation_rules_project ON automation_rules(project_id);

-- ── Phase 2: Logo & Brand Identity ──
ALTER TABLE projects ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_kit JSONB DEFAULT '{}'::jsonb;

-- ── Phase 3: Email Deliverability ──
CREATE TABLE IF NOT EXISTS email_deliverability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  sent INT DEFAULT 0,
  delivered INT DEFAULT 0,
  bounced INT DEFAULT 0,
  spam_complaints INT DEFAULT 0,
  opens INT DEFAULT 0,
  clicks INT DEFAULT 0,
  inbox_rate NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_deliverability_project ON email_deliverability(project_id, date);

CREATE TABLE IF NOT EXISTS email_warmup_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  warmup_day INT DEFAULT 0,
  daily_volume INT DEFAULT 5,
  status TEXT DEFAULT 'active',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id)
);

CREATE TABLE IF NOT EXISTS email_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  campaign_id UUID,
  test_type TEXT NOT NULL,
  variant_a JSONB NOT NULL,
  variant_b JSONB NOT NULL,
  winner TEXT,
  status TEXT DEFAULT 'running',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ── Phase 4: Session Replay & Analytics ──
CREATE TABLE IF NOT EXISTS session_replays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  duration_ms INT,
  pages TEXT[],
  events_count INT,
  device TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_session_replays_project ON session_replays(project_id, started_at DESC);

CREATE TABLE IF NOT EXISTS analytics_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics_goal_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES analytics_goals(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  session_id TEXT,
  converted_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_goal_conversions_goal ON analytics_goal_conversions(goal_id, converted_at DESC);

-- ── Phase 5: CRM Deal Pipeline ──
CREATE TABLE IF NOT EXISTS deal_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  color TEXT DEFAULT '#3b82f6'
);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_project ON deal_pipeline_stages(project_id, sort_order);

CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES deal_pipeline_stages(id),
  title TEXT NOT NULL,
  value_cents INT DEFAULT 0,
  probability INT DEFAULT 50,
  notes TEXT,
  expected_close_date DATE,
  won_at TIMESTAMPTZ,
  lost_at TIMESTAMPTZ,
  lost_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deals_project ON deals(project_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage_id);

CREATE TABLE IF NOT EXISTS deal_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deal_activities_deal ON deal_activities(deal_id, created_at DESC);

-- ── Company Blog Posts ──
CREATE TABLE IF NOT EXISTS company_blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  cover_image_url TEXT,
  status TEXT DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  seo_title TEXT,
  seo_description TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_company_blog_posts_project ON company_blog_posts(project_id, status, published_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- FRONTIER AI: Video Generation, Social Media Autopilot, Sales Outreach
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Videos (AI-generated video content per project) ──
CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'launch_announcement',
  title TEXT NOT NULL,
  description TEXT,
  url TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  platform TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'generating',
  script_text TEXT,
  external_video_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_videos_project ON videos(project_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(project_id, status);

-- ── Social Posts (cross-platform social media posts) ──
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  content TEXT NOT NULL,
  media_url TEXT,
  video_id UUID REFERENCES videos(id) ON DELETE SET NULL,
  hashtags TEXT[] DEFAULT '{}',
  scheduled_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  external_post_id TEXT,
  external_post_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  engagement JSONB DEFAULT '{}'::jsonb,
  error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_posts_project ON social_posts(project_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_schedule
  ON social_posts(project_id, status, scheduled_at)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_social_posts_platform ON social_posts(project_id, platform);

-- ── Outreach Sequences (multi-step email campaigns via Instantly.ai) ──
CREATE TABLE IF NOT EXISTS outreach_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  instantly_campaign_id TEXT,
  total_steps INTEGER DEFAULT 0,
  completed_steps INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outreach_sequences_project ON outreach_sequences(project_id);
CREATE INDEX IF NOT EXISTS idx_outreach_sequences_lead ON outreach_sequences(lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_sequences_status ON outreach_sequences(project_id, status);

-- ── Outreach Events (webhook events from Instantly.ai) ──
CREATE TABLE IF NOT EXISTS outreach_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sequence_id UUID REFERENCES outreach_sequences(id) ON DELETE CASCADE,
  lead_email TEXT NOT NULL,
  event_type TEXT NOT NULL,
  step_number INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outreach_events_project ON outreach_events(project_id);
CREATE INDEX IF NOT EXISTS idx_outreach_events_sequence ON outreach_events(sequence_id);

-- ── Lead table extensions for outreach tracking ──
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sequence_status TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_outreach_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS reply_status TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS outreach_sequence_id UUID;

-- ── Email Sends (warmup tracking & bounce monitoring) ──
CREATE TABLE IF NOT EXISTS email_sends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id),
  recipient TEXT NOT NULL,
  subject TEXT,
  status TEXT DEFAULT 'sent',
  bounce_type TEXT,
  sent_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_sends_project ON email_sends(project_id, sent_at);

-- ── Agent Activity (autonomous orchestrator decision log) ──
CREATE TABLE IF NOT EXISTS agent_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  action TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_activity_project ON agent_activity(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_activity_created ON agent_activity(created_at DESC);

-- ── Autonomous mode toggle on projects ──
ALTER TABLE projects ADD COLUMN IF NOT EXISTS autonomous_mode BOOLEAN DEFAULT TRUE;


-- ── Blog post cover images (for company showcase posts) ──
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Short-form Video Pipeline (Shorts / Reels)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS video_shorts (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id      TEXT,  -- NULL for Artha internal content
  -- Topic
  topic           TEXT NOT NULL,
  topic_source    TEXT,
  topic_research  JSONB,
  -- Script
  script          TEXT,
  script_hook     TEXT,
  script_cta      TEXT,
  duration_target TEXT DEFAULT 'short',
  -- Video
  video_url       TEXT,
  thumbnail_url   TEXT,
  invideo_id      TEXT,
  video_platform  TEXT DEFAULT 'youtube_shorts',
  aspect_ratio    TEXT DEFAULT '9:16',
  -- Split-screen
  layout          TEXT DEFAULT 'split_screen',
  gameplay_clip_key TEXT,
  -- A/B testing
  variant         TEXT DEFAULT 'A',
  content_category TEXT,
  -- Approval
  status          TEXT DEFAULT 'topic_discovered',
  approved_by     TEXT,
  approved_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  -- Metadata
  metadata        JSONB DEFAULT '{}',
  error           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_video_shorts_project ON video_shorts(project_id);
CREATE INDEX IF NOT EXISTS idx_video_shorts_status ON video_shorts(status);
CREATE INDEX IF NOT EXISTS idx_video_shorts_created ON video_shorts(created_at DESC);

CREATE TABLE IF NOT EXISTS video_shorts_posts (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  video_short_id  TEXT REFERENCES video_shorts(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL,
  external_post_id TEXT,
  post_url        TEXT,
  caption         TEXT,
  status          TEXT DEFAULT 'pending',
  error           TEXT,
  views           INTEGER DEFAULT 0,
  likes           INTEGER DEFAULT 0,
  comments        INTEGER DEFAULT 0,
  shares          INTEGER DEFAULT 0,
  posted_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vsp_video ON video_shorts_posts(video_short_id);

CREATE TABLE IF NOT EXISTS video_shorts_config (
  project_id      TEXT PRIMARY KEY,
  enabled         BOOLEAN DEFAULT false,
  frequency       TEXT DEFAULT 'daily',
  platforms       TEXT[] DEFAULT ARRAY['twitter', 'bluesky'],
  auto_approve    BOOLEAN DEFAULT false,
  voice_style     TEXT DEFAULT 'energetic',
  music_mood      TEXT DEFAULT 'upbeat',
  content_focus   TEXT,
  max_per_week    INTEGER DEFAULT 14,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── UGC Video Jobs ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ugc_video_jobs (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         TEXT,                              -- NULL for free tool usage
  project_id      TEXT,                              -- NULL for free tool usage
  ip_address      TEXT,                              -- for free tool rate limiting

  -- Input
  script          TEXT NOT NULL,
  voice_id        TEXT NOT NULL,                     -- ElevenLabs voice_id
  avatar_type     TEXT NOT NULL DEFAULT 'preset',    -- 'preset' or 'custom'
  avatar_id       TEXT,                              -- preset avatar id
  avatar_image_url TEXT NOT NULL,                    -- R2 key or URL to avatar image

  -- Processing state
  status          TEXT NOT NULL DEFAULT 'pending',   -- pending|tts|lip_sync|composing|done|failed
  tts_audio_key   TEXT,                              -- R2 key for generated audio
  raw_video_url   TEXT,                              -- SadTalker output URL
  final_video_key TEXT,                              -- R2 key for final captioned video
  final_video_url TEXT,                              -- public URL for final video

  -- Output
  duration_seconds NUMERIC(6,2),

  -- Meta
  error           TEXT,
  credits_charged NUMERIC(4,1) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ugc_jobs_user ON ugc_video_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_ugc_jobs_project ON ugc_video_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_ugc_jobs_status ON ugc_video_jobs(status);
