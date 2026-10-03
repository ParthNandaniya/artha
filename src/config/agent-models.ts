import type { ModelTaskName } from "@/lib/types";

export type ModelProvider = "openai" | "anthropic";

export const CLAUDE_OPUS = "claude-opus-4-6";
export const CLAUDE_SONNET = "claude-sonnet-4-6";

export const GPT_5_4 = "gpt-5.4";
export const GPT_5 = "gpt-5";
export const GPT_5_4_MINI = "gpt-5.4-mini";
export const GPT_4_1 = "gpt-4.1";
export const GPT_4O = "gpt-4o";
export const GPT_4O_MINI = "gpt-4o-mini";

export interface AgentModelConfig {
  enabled: boolean;
  provider: ModelProvider;
  model: string;
  fallback?: {
    provider: ModelProvider;
    model: string;
  };
}

/**
 * Fallback mapping: DISABLED — all tasks use OpenAI only.
 * No Anthropic fallback to avoid burning ANTHROPIC_API_KEY credits.
 * If OpenAI fails, the task errors out and retries on next run.
 */
const OPENAI_FALLBACKS: Record<string, { provider: ModelProvider; model: string }> = {
  // All fallbacks disabled — OpenAI only
};

/**
 * Centralized model routing for ALL AI tasks.
 *
 * Tiering:
 *   - GPT-5:      complex reasoning — research, website building, lead finding
 *   - GPT-4.1:    strong general tasks — writing, agents, editing
 *   - GPT-4o:     fast orchestrator tasks
 *   - GPT-4o-mini: sub-second latency for classification & moderation
 *
 * Any caller CAN override the model for a specific invocation by passing
 * `{ model: "..." }` in the options parameter to the router functions.
 * This config defines the *default* for each task.
 */
export const AGENT_MODEL_CONFIG: Record<ModelTaskName, AgentModelConfig> = {
  // ── Agent tasks (GPT-5 — deep reasoning + synthesis) ──
  research:               { enabled: true, provider: "openai", model: GPT_5_4 },
  pipeline_research_user: { enabled: true, provider: "openai", model: GPT_5_4 },

  // ── Onboarding research (GPT-4.1 — fast, good enough for initial pass) ──
  research_onboarding:    { enabled: true, provider: "openai", model: GPT_4O },

  // ── Agent tasks (GPT-5.4 — flagship model for website generation) ──
  website_builder:        { enabled: true, provider: "openai", model: GPT_5_4 },
  email_writer:           { enabled: true, provider: "openai", model: GPT_4O },
  twitter:                { enabled: true, provider: "openai", model: GPT_4O },
  lead_finder:            { enabled: true, provider: "openai", model: GPT_5_4 },
  stripe_agent:           { enabled: true, provider: "openai", model: GPT_4O },

  // ── Agent tasks (OpenAI — structured output + instruction following) ──
  task_generator:         { enabled: true, provider: "openai", model: GPT_4O },
  database_manager:       { enabled: true, provider: "openai", model: GPT_4O },

  // ── Orchestrator tasks (OpenAI — fast + capable) ──
  direct_answer:          { enabled: true, provider: "openai", model: GPT_4O },

  // ── Validation tasks ──
  quality_judge:          { enabled: true, provider: "openai", model: GPT_4O },

  // ── Fast tasks (GPT-4o — reliable json_object support, sub-second latency) ──
  intent_classification:  { enabled: true, provider: "openai", model: GPT_4O },
  form_enhancement:       { enabled: true, provider: "openai", model: GPT_4O },
  pipeline_naming:        { enabled: true, provider: "openai", model: GPT_4O },
  content_moderation:     { enabled: true, provider: "openai", model: GPT_4O },

  // ── Twitter growth bot ──
  twitter_growth:         { enabled: true, provider: "openai", model: GPT_4O },

  // ── Autonomy agents ──
  email_replier:          { enabled: true, provider: "openai", model: GPT_4O },
  content_planner:        { enabled: true, provider: "openai", model: GPT_4O },
  analytics_agent:        { enabled: true, provider: "openai", model: GPT_4O },
  competitive_monitor:    { enabled: true, provider: "openai", model: GPT_4O },
  seo_agent:              { enabled: true, provider: "openai", model: GPT_4O },
  blog_writer:            { enabled: true, provider: "openai", model: GPT_5_4 },
  company_showcase:       { enabled: true, provider: "openai", model: GPT_4O },
  chat_widget:            { enabled: true, provider: "openai", model: GPT_4O },

  // ── Frontier AI agents ──
  video_generator:          { enabled: true, provider: "openai", model: GPT_4O },
  social_media_manager:     { enabled: true, provider: "openai", model: GPT_4O },
  sales_sequencer:          { enabled: true, provider: "openai", model: GPT_5_4 },

  // ── Frontier AI model tasks ──
  video_generation:         { enabled: true, provider: "openai", model: GPT_4O },
  social_posting:           { enabled: true, provider: "openai", model: GPT_4O },
  sales_sequence:           { enabled: true, provider: "openai", model: GPT_5_4 },

  // ── Website editor (GPT-4o — fast enough for HTML edits, GPT-5.4 is too slow) ──
  website_editor:           { enabled: true, provider: "openai", model: GPT_4O },

  // ── Artha Ops agents (all GPT-4.1 — cost-optimized, async) ──
  artha_growth:         { enabled: true, provider: "openai", model: GPT_4O },
  artha_support:        { enabled: true, provider: "openai", model: GPT_4O },
  artha_sales:          { enabled: true, provider: "openai", model: GPT_4O },
  artha_analytics:      { enabled: true, provider: "openai", model: GPT_4O },
  artha_ops:            { enabled: true, provider: "openai", model: GPT_4O },
  artha_product:        { enabled: true, provider: "openai", model: GPT_4O },
  artha_community:      { enabled: true, provider: "openai", model: GPT_4O },

  // ── Shorts pipeline ──
  shorts_pipeline:          { enabled: true, provider: "openai", model: GPT_5_4 },
  artha_video_growth:       { enabled: true, provider: "openai", model: GPT_5_4 },
  shorts_topic_discovery:   { enabled: true, provider: "openai", model: GPT_5_4 },
  shorts_script_writer:     { enabled: true, provider: "openai", model: GPT_5_4 },

  // ── Autonomous orchestrator (GPT-4o — fast decision-making) ──
  autonomous_orchestrator: { enabled: true, provider: "openai", model: GPT_5_4 },

  // ── UGC shorts tool ──
  ugc_script_writer:    { enabled: true, provider: "openai", model: GPT_4O },
  ugc_video_generation: { enabled: true, provider: "openai", model: GPT_4O },

  // ── Free tools (GPT-4.1 — cost-optimized for lead-gen pages) ──
  free_tool:            { enabled: true, provider: "openai", model: GPT_5_4 },
};

export function getAgentModelConfig(task: ModelTaskName): AgentModelConfig {
  const config = AGENT_MODEL_CONFIG[task];
  // Auto-attach fallback for OpenAI models if not explicitly set
  if (config.provider === "openai" && !config.fallback) {
    const fb = OPENAI_FALLBACKS[config.model];
    if (fb) return { ...config, fallback: fb };
  }
  return config;
}
