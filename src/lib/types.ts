export type ProjectStatus = "onboarding" | "active" | "paused";
export type SubscriptionStatus = "none" | "active" | "cancelled" | "past_due" | "paused" | "trialing";
export type DocumentType =
  | "mission"
  | "market_research"
  | "lead_research"
  | "customer_research"
  | "ads_research"
  | "target_audience"
  | "competitor_analysis"
  | "market_trends"
  | "pricing_research"
  | "content_research"
  | "research"
  | "plan"
  | "custom";
export type TaskType = "mission_gen" | "market_research" | "landing_page" | "email_setup" | "outreach" | "newsletter" | "research" | "custom" | "analytics_review" | "seo_audit" | "competitive_check";
export type TaskStatus = "pending" | "queued" | "running" | "completed" | "failed" | "rejected" | "pending_confirmation";
export type TaskSource = "system" | "chat" | "manual" | "email";
export type TaskTag = "research" | "marketing" | "cold-outreach" | "engineering" | "social" | "content" | "newsletter" | "seo" | "analytics";
export type AgentName = "research" | "website_builder" | "email_writer" | "task_generator" | "twitter" | "lead_finder" | "database_manager" | "stripe_agent" | "email_replier" | "content_planner" | "analytics_agent" | "competitive_monitor" | "seo_agent" | "blog_writer" | "video_generator" | "social_media_manager" | "sales_sequencer" | "shorts_pipeline" | "artha_video_growth" | "artha_growth" | "artha_support" | "artha_sales" | "artha_analytics" | "artha_ops" | "artha_product" | "artha_community";
export type ModelTaskName =
  | AgentName
  | "quality_judge"
  | "intent_classification"
  | "direct_answer"
  | "form_enhancement"
  | "pipeline_naming"
  | "pipeline_research_user"
  | "research_onboarding"
  | "content_moderation"
  | "twitter_growth"
  | "chat_widget"
  | "website_editor"
  | "video_generation"
  | "social_posting"
  | "sales_sequence"
  | "free_tool"
  | "autonomous_orchestrator"
  | "company_showcase"
  | "shorts_topic_discovery"
  | "shorts_script_writer"
  | "ugc_script_writer"
  | "ugc_video_generation";
export type LeadStatus = "new" | "contacted" | "replied" | "qualified" | "converted" | "lost";
export type RevenueType = "income" | "withdrawal";
export type RevenueStatus = "pending" | "completed" | "failed";
export type WebsiteDeploymentStatus = "not_deployed" | "ready" | "deploying" | "deployed" | "failed";

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  google_data: Record<string, unknown>;
  stripe_customer_id: string | null;
  stripe_connect_account_id: string | null;
  paypal_payout_email: string | null;
  created_at: string;
}

export interface TwitterAccountStatus {
  appConfigured: boolean;
  connected: boolean;
  accountId: string | null;
  accountName: string | null;
  connectionError: string | null;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  subscription_status: SubscriptionStatus;
  stripe_subscription_id: string | null;
  neon_project_id: string | null;
  neon_connection_url: string | null;
  github_repo_url: string | null;
  github_repo_full_name: string | null;
  company_email: string | null;
  email_setup_status: "pending" | "configured" | "skipped" | "failed";
  email_setup_error: string | null;
  landing_page_html: string | null;
  landing_page_published: boolean;
  first_tweet_url: string | null;
  tweet_setup_status: "pending" | "configured" | "skipped" | "failed";
  tweet_setup_error: string | null;
  cloudflare_setup_status: "pending" | "configured" | "skipped" | "failed";
  cloudflare_setup_error: string | null;
  memory: Record<string, unknown>;
  task_credits: number;
  revenue_balance_cents: number;
  marketplace_enabled: boolean;
  marketplace_fee_percent: number;
  custom_domain: string | null;
  custom_email_domain: string | null;
  email_domain_verified: boolean;
  current_period_end: string | null;
  autonomous_mode: boolean;
  created_at: string;
}

export interface ProjectWebsite {
  projectId: string;
  title: string | null;
  liveUrl: string;
  previewUrl: string | null;
  previewHtml: string | null;
  deployedHtml: string | null;
  published: boolean;
  hasDraft: boolean;
  hasUnpublishedChanges: boolean;
  hasStashedDraft: boolean;
  deploymentStatus: WebsiteDeploymentStatus;
  deploymentError: string | null;
  lastDraftUpdatedAt: string | null;
  lastDeployedAt: string | null;
}

export interface Document {
  id: string;
  project_id: string;
  type: DocumentType;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  type: TaskType;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  prompt: string | null;
  result: Record<string, unknown> | null;
  summary: string | null;
  output_document_id: string | null;
  output_url: string | null;
  credits_cost: number;
  is_recurring: boolean;
  recurrence_interval: "daily" | "weekly" | "biweekly" | "monthly" | null;
  next_run_at: string | null;
  last_run_at: string | null;
  recurrence_count: number;
  source: TaskSource;
  tag: TaskTag | null;
  agent: AgentName | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  project_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  type: "chat" | "system" | "email";
  task_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ProjectSettings {
  outreach_auto_send: boolean;
  ads_auto_launch?: boolean;
  ads_daily_budget_cents?: number;
  ads_platform_fee_percent?: number;
  ads_platform?: "meta";
  ads_account_connection_model?: "customer_owned_meta_account";
  ads_creative_format?: "image" | "video";
}

export interface OutreachEmail {
  to: string;
  toName?: string;
  company?: string;
  role?: string;
  subject: string;
  body: string;
}

export interface OutreachConfirmationData {
  taskId: string;
  projectId: string;
  emails: OutreachEmail[];
  strategy?: string;
  fromAddress: string;
}

export interface Subscription {
  id: string;
  project_id: string;
  user_id: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  plan: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  cancelled_at: string | null;
}

export interface RevenueTransaction {
  id: string;
  project_id: string;
  type: RevenueType;
  amount_cents: number;
  gross_amount_cents: number | null;
  platform_fee_cents: number | null;
  seller_net_amount_cents: number | null;
  currency: string | null;
  description: string | null;
  stripe_transfer_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_invoice_id: string | null;
  stripe_subscription_id: string | null;
  external_payout_method: string | null;
  external_payout_email: string | null;
  status: RevenueStatus;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export type PanelType =
  | "overview"
  | "tasks"
  | "agent-activity"
  | "research"
  | "ads"
  | "leads"
  | "documents"
  | "landing-page"
  | "analytics"
  | "email"
  | "twitter"
  | "revenue"
  | "marketplace"
  | "automations"
  | "settings";

export interface Tweet {
  id: string;
  tweet_id: string;
  tweet_url: string;
  content: string;
  type: "launch" | "update" | "milestone" | "custom";
  posted_at: string;
}

// ── Video Generation Types ──
export type VideoType = "launch_announcement" | "product_explainer" | "social_clip";
export type VideoStatus = "generating" | "ready" | "failed";
export type VideoPlatform = "tiktok" | "instagram_reels" | "youtube_shorts" | "linkedin" | "twitter" | "general";

export interface Video {
  id: string;
  project_id: string;
  type: VideoType;
  title: string;
  description: string | null;
  url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  platform: VideoPlatform;
  status: VideoStatus;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ── Social Media Types ──
export type SocialPlatform = "twitter" | "linkedin" | "instagram" | "tiktok" | "youtube" | "threads";
export type SocialPostStatus = "draft" | "scheduled" | "posted" | "failed";

export interface SocialPost {
  id: string;
  project_id: string;
  platform: SocialPlatform;
  content: string;
  media_url: string | null;
  scheduled_at: string | null;
  posted_at: string | null;
  external_post_id: string | null;
  status: SocialPostStatus;
  engagement: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ── Outreach Sequence Types ──
export type SequenceStatus = "draft" | "active" | "paused" | "completed";
export type SequenceStepStatus = "pending" | "sent" | "opened" | "replied" | "bounced";

export interface OutreachSequence {
  id: string;
  project_id: string;
  lead_id: string | null;
  name: string;
  status: SequenceStatus;
  steps: OutreachSequenceStep[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface OutreachSequenceStep {
  step_number: number;
  subject: string;
  body_html: string;
  delay_days: number;
  status: SequenceStepStatus;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
}

export type ResearchTag =
  | "market_research"
  | "lead_research"
  | "customer_research"
  | "ads_research"
  | "target_audience"
  | "competitor_analysis"
  | "market_trends"
  | "pricing_research"
  | "content_research"
  | string;

export interface Lead {
  id: string;
  name: string | null;
  email: string | null;
  linkedin_url: string | null;
  company: string | null;
  role: string | null;
  phone: string | null;
  website: string | null;
  source: string | null;
  source_research_id: string | null;
  score: number;
  status: LeadStatus;
  contacted: boolean;
  contacted_at: string | null;
  notes: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ResearchTagRecord {
  id: string;
  project_id: string;
  tag: string;
  label: string;
  description: string | null;
  color: string | null;
  created_at: string;
}

export interface ResearchSuggestion {
  id: string;
  tag: ResearchTag;
  title: string;
  description: string;
  icon: string;
}

export interface ChartData {
  type: "bar" | "line" | "pie" | "funnel" | "radar" | "table";
  title: string;
  data: Record<string, unknown>;
  description?: string;
}

export interface PipelineLog {
  timestamp: number;
  message: string;
  type: "info" | "success" | "error";
}

export interface PipelineStep {
  id: string;
  label: string;
  status: "pending" | "running" | "completed" | "failed";
  output?: string;
  logs: PipelineLog[];
}

// Email threads
export interface EmailThread {
  id: string;
  subject: string;
  participants: string[];
  last_message_at: string;
  message_count: number;
  is_read: boolean;
  snippet: string | null;
  created_at: string;
}

export interface EmailMessage {
  id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  from_email: string;
  to_email: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  message_id: string | null;
  in_reply_to: string | null;
  created_at: string;
}

// Analytics
export interface AnalyticsSummary {
  totalPageviews: number;
  uniqueVisitors: number;
  totalSessions: number;
  avgSessionDurationMs: number;
  medianSessionDurationMs: number;
  engagementRate: number;
}

export interface AnalyticsDaily {
  day: string;
  pageviews: number;
  visitors: number;
}

export interface AnalyticsTopPage {
  path: string;
  views: number;
  unique_visitors: number;
}

export interface AnalyticsTopReferrer {
  referrer: string;
  count: number;
}

export interface AnalyticsTopClick {
  button_text: string | null;
  element_tag: string;
  href: string | null;
  clicks: number;
}

export interface AnalyticsDevice {
  device: "mobile" | "tablet" | "desktop";
  visitors: number;
}

export interface AnalyticsData {
  summary: AnalyticsSummary;
  daily: AnalyticsDaily[];
  topPages: AnalyticsTopPage[];
  topReferrers: AnalyticsTopReferrer[];
  topClicks: AnalyticsTopClick[];
  devices: AnalyticsDevice[];
  dateRange: { days: number; since: string };
}

// ── Artha Ops Types ──

export type ArthaOpsAgentName = "artha_growth" | "artha_support" | "artha_sales" | "artha_analytics" | "artha_ops" | "artha_product" | "artha_community";

export type ArthaOpsRunStatus = "running" | "completed" | "failed";
export type ArthaOpsTrigger = "cron" | "webhook" | "manual";
export type ArthaOpsApprovalStatus = "pending" | "approved" | "rejected";

export interface ArthaOpsRun {
  id: string;
  agent_name: ArthaOpsAgentName;
  trigger: ArthaOpsTrigger;
  status: ArthaOpsRunStatus;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  actions_taken: Record<string, unknown>[] | null;
  tokens_used: number;
  cost_usd: number;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ArthaOpsApproval {
  id: string;
  run_id: string;
  agent_name: ArthaOpsAgentName;
  action_type: string;
  payload: Record<string, unknown>;
  status: ArthaOpsApprovalStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}
