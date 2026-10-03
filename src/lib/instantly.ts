/**
 * Instantly.ai API Client
 *
 * Cold email outreach platform with warmup, deliverability controls,
 * and unlimited account rotation. Manages campaigns, leads, and sequences.
 *
 * Env vars:
 *   INSTANTLY_API_KEY  — Instantly.ai API key
 *   INSTANTLY_BASE_URL — Base URL (default: https://api.instantly.ai/api/v2)
 */

export interface InstantlyCampaign {
  id: string;
  name: string;
  status: "draft" | "active" | "paused" | "completed";
  created_at: string;
}

export interface InstantlyLead {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  title?: string;
  website?: string;
  linkedin_url?: string;
  custom_variables?: Record<string, string>;
}

export interface InstantlySequenceStep {
  subject: string;
  body: string;
  delay_days: number;
  variant?: string;
}

export interface InstantlyAnalytics {
  campaign_id: string;
  total_leads: number;
  emails_sent: number;
  emails_opened: number;
  emails_replied: number;
  emails_bounced: number;
  open_rate: number;
  reply_rate: number;
  bounce_rate: number;
}

export interface InstantlyWebhookEvent {
  event: "email_sent" | "email_opened" | "email_replied" | "email_bounced" | "lead_unsubscribed";
  campaign_id: string;
  lead_email: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

interface InstantlyConfig {
  apiKey: string;
  baseUrl: string;
}

function getConfig(): InstantlyConfig {
  const apiKey = process.env.INSTANTLY_API_KEY;
  if (!apiKey) {
    throw new Error("INSTANTLY_API_KEY is not configured");
  }
  return {
    apiKey,
    baseUrl: process.env.INSTANTLY_BASE_URL || "https://api.instantly.ai/api/v2",
  };
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const config = getConfig();
  const url = `${config.baseUrl}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error");
    throw new Error(`Instantly API error ${response.status}: ${errorBody}`);
  }

  return response.json() as Promise<T>;
}

// ── Campaign Management ─────────────────────────────────────────────

/**
 * Create a new outreach campaign.
 */
export async function createCampaign(opts: {
  name: string;
  fromEmail: string;
  sequences: InstantlySequenceStep[];
  dailyLimit?: number;
  warmupEnabled?: boolean;
}): Promise<InstantlyCampaign> {
  return apiRequest<InstantlyCampaign>("/campaigns", {
    method: "POST",
    body: JSON.stringify({
      name: opts.name,
      from_email: opts.fromEmail,
      sequences: opts.sequences.map((s, i) => ({
        step: i + 1,
        subject: s.subject,
        body: s.body,
        delay: s.delay_days,
        variant: s.variant,
      })),
      daily_limit: opts.dailyLimit || 30,
      warmup_enabled: opts.warmupEnabled !== false,
    }),
  });
}

/**
 * Get campaign details.
 */
export async function getCampaign(campaignId: string): Promise<InstantlyCampaign> {
  return apiRequest<InstantlyCampaign>(`/campaigns/${campaignId}`);
}

/**
 * Start a campaign (move from draft to active).
 */
export async function startCampaign(campaignId: string): Promise<void> {
  await apiRequest(`/campaigns/${campaignId}/start`, { method: "POST" });
}

/**
 * Pause a campaign.
 */
export async function pauseCampaign(campaignId: string): Promise<void> {
  await apiRequest(`/campaigns/${campaignId}/pause`, { method: "POST" });
}

// ── Lead Management ──────────────────────────────────────────────────

/**
 * Add leads to a campaign.
 */
export async function addLeadsToCampaign(
  campaignId: string,
  leads: InstantlyLead[],
): Promise<{ added: number; skipped: number }> {
  return apiRequest(`/campaigns/${campaignId}/leads`, {
    method: "POST",
    body: JSON.stringify({
      leads: leads.map((l) => ({
        email: l.email,
        first_name: l.first_name,
        last_name: l.last_name,
        company_name: l.company_name,
        title: l.title,
        website: l.website,
        linkedin_url: l.linkedin_url,
        custom_variables: l.custom_variables,
      })),
    }),
  });
}

/**
 * Get lead status within a campaign.
 */
export async function getLeadStatus(
  campaignId: string,
  email: string,
): Promise<{
  email: string;
  status: "active" | "completed" | "replied" | "bounced" | "unsubscribed";
  emails_sent: number;
  last_email_at: string | null;
}> {
  return apiRequest(`/campaigns/${campaignId}/leads/${encodeURIComponent(email)}`);
}

// ── Analytics ────────────────────────────────────────────────────────

/**
 * Get campaign analytics.
 */
export async function getCampaignAnalytics(campaignId: string): Promise<InstantlyAnalytics> {
  return apiRequest<InstantlyAnalytics>(`/campaigns/${campaignId}/analytics`);
}

// ── Warmup ───────────────────────────────────────────────────────────

/**
 * Enable warmup for a sending account.
 */
export async function enableWarmup(email: string): Promise<void> {
  await apiRequest("/warmup/enable", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

/**
 * Get warmup health score for a sending account.
 */
export async function getWarmupHealth(email: string): Promise<{
  email: string;
  health_score: number;
  daily_limit: number;
  warmup_active: boolean;
}> {
  return apiRequest(`/warmup/health?email=${encodeURIComponent(email)}`);
}

// ── Webhooks ─────────────────────────────────────────────────────────

/**
 * Register a webhook for campaign events.
 */
export async function registerWebhook(opts: {
  url: string;
  events: InstantlyWebhookEvent["event"][];
  campaignId?: string;
}): Promise<{ id: string }> {
  return apiRequest("/webhooks", {
    method: "POST",
    body: JSON.stringify({
      url: opts.url,
      events: opts.events,
      campaign_id: opts.campaignId,
    }),
  });
}

/**
 * Check if Instantly is configured.
 */
export function isInstantlyConfigured(): boolean {
  return !!process.env.INSTANTLY_API_KEY;
}
