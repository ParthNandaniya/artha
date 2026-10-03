import type { AgentName } from "@/lib/types";

/**
 * Credit cost per agent execution.
 *
 * Updated for the agentic upgrade (ReAct loops, extended thinking, quality validation):
 *   - twitter: lightweight, minimal upgrade → 0.3
 *   - email_writer: quality judge + memory tool → 0.5
 *   - task_generator: memory query added → 0.5
 *   - website_builder: agentic loop + thinking + validation → 2.0
 *   - research: biggest upgrade (5 tools, thinking, sub-agents) → 2.5
 *   - lead_finder: agentic search + thinking → 2.0
 *   - database_manager: validation added → 1.0
 *   - stripe_agent: minimal change → 0.5
 */
export const CREDIT_COSTS: Record<AgentName, number> = {
  twitter: 0.3,
  email_writer: 0.5,
  task_generator: 0.5,
  website_builder: 1.0,
  research: 1.5,
  lead_finder: 1.0,
  database_manager: 1.0,
  stripe_agent: 0.5,
  email_replier: 0.8,
  content_planner: 0.5,
  analytics_agent: 1.0,
  competitive_monitor: 1.5,
  seo_agent: 2.0,
  video_generator: 1.5,
  social_media_manager: 0.5,
  sales_sequencer: 1.5,
  shorts_pipeline: 2,
  artha_video_growth: 0,
  blog_writer: 0,
  artha_growth: 0,
  artha_support: 0,
  artha_sales: 0,
  artha_analytics: 0,
  artha_ops: 0,
  artha_product: 0,
  artha_community: 0,
};

/** Default credit cost when agent type is unknown. */
export const DEFAULT_CREDIT_COST = 1;

/**
 * Credit costs for lightweight AI feature calls (single-call, user-triggered).
 *   - form_enhancement: generate or enhance a form field with AI → 0.1
 *   - task_generate: suggest a task title/description with AI → 0.1
 */
export const ENHANCE_COST = 0.1;
export const GENERATE_TASK_COST = 0.1;
export const CHAT_QUESTION_COST = 0.1;
export const OUTBOUND_EMAIL_COST = 0.1;
export const FOLLOWUP_GENERATION_COST = 0.3;

/**
 * Inline action costs (Phase 1: AI Everywhere).
 * These are lightweight single-call actions embedded directly in panels.
 */
export const INLINE_SUGGEST_COST = 0.2;
export const INLINE_ENRICH_COST = 0.3;
export const INLINE_DRAFT_COST = 0.3;
export const INLINE_DEEP_DIVE_COST = 0.3;
export const INLINE_WEBSITE_COST = 0.3;

/** Look up credit cost for a given agent. Returns default if null/undefined. */
export function getCreditCost(agent: AgentName | null | undefined): number {
  if (!agent) return DEFAULT_CREDIT_COST;
  return CREDIT_COSTS[agent] ?? DEFAULT_CREDIT_COST;
}
