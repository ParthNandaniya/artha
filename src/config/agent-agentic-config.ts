import type { AgentName } from "@/lib/types";
import type { AgenticConfig, AgenticOverrides } from "@/lib/agents/framework/types";

// ── Per-Agent Default Configurations ────────────────────────────────

const AGENTIC_DEFAULTS: Record<AgentName, AgenticConfig> = {
  research: {
    agent: "research",
    maxIterations: 8,
    tools: ["web_search", "extract_url", "query_memory", "update_memory", "find_similar", "run_sub_agent"],
    useExtendedThinking: true,
    thinkingBudget: 16_000,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: true, threshold: 3.5 },
    },
    maxRetries: 2,
    maxSubAgents: 1,
    timeoutMs: 150_000,
    maxToolResultChars: 16_000,
    reflectionEnabled: true,
    maxEstimatedTokens: 120_000,
  },

  website_builder: {
    agent: "website_builder",
    maxIterations: 4,
    tools: ["query_memory", "web_search"],
    useExtendedThinking: true,
    thinkingBudget: 8_000,
    validationCriteria: {
      structural: { htmlValidation: true },
      quality: { enabled: true, threshold: 3.5 },
    },
    maxRetries: 1,
    maxSubAgents: 0,
    timeoutMs: 75_000,
    reflectionEnabled: true,
  },

  lead_finder: {
    agent: "lead_finder",
    maxIterations: 7,
    tools: ["web_search", "extract_url", "query_memory", "run_sub_agent"],
    useExtendedThinking: true,
    thinkingBudget: 12_000,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: true, threshold: 3.0 },
    },
    maxRetries: 1,
    maxSubAgents: 1,
    timeoutMs: 120_000,
    maxToolResultChars: 12_000,
    reflectionEnabled: true,
    maxEstimatedTokens: 100_000,
  },

  email_writer: {
    agent: "email_writer",
    maxIterations: 3,
    tools: ["query_memory", "run_sub_agent", "web_search"],
    useExtendedThinking: true,
    thinkingBudget: 4_000,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: true, threshold: 3.0 },
    },
    maxRetries: 1,
    maxSubAgents: 1,
    timeoutMs: 45_000,
  },

  twitter: {
    agent: "twitter",
    maxIterations: 1,
    tools: [],
    useExtendedThinking: false,
    validationCriteria: {
      structural: { maxLength: { tweet: 280 } },
      quality: { enabled: false, threshold: 3.0 },
    },
    maxRetries: 1,
    maxSubAgents: 0,
    timeoutMs: 15_000,
  },

  task_generator: {
    agent: "task_generator",
    maxIterations: 3,
    tools: ["query_memory", "find_similar"],
    useExtendedThinking: true,
    thinkingBudget: 4_000,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: true, threshold: 3.0 },
    },
    maxRetries: 1,
    maxSubAgents: 0,
    timeoutMs: 25_000,
  },

  database_manager: {
    agent: "database_manager",
    maxIterations: 1,
    tools: [],
    useExtendedThinking: false,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: false, threshold: 3.0 },
    },
    maxRetries: 1,
    maxSubAgents: 0,
    timeoutMs: 20_000,
  },

  stripe_agent: {
    agent: "stripe_agent",
    maxIterations: 1,
    tools: [],
    useExtendedThinking: false,
    validationCriteria: undefined,
    maxRetries: 0,
    maxSubAgents: 0,
    timeoutMs: 15_000,
  },

  email_replier: {
    agent: "email_replier",
    maxIterations: 3,
    tools: ["query_memory", "find_similar", "update_memory"],
    useExtendedThinking: true,
    thinkingBudget: 4_000,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: true, threshold: 3.0 },
    },
    maxRetries: 1,
    maxSubAgents: 0,
    timeoutMs: 45_000,
  },

  content_planner: {
    agent: "content_planner",
    maxIterations: 2,
    tools: ["query_memory", "web_search", "find_similar"],
    useExtendedThinking: false,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: true, threshold: 3.0 },
    },
    maxRetries: 1,
    maxSubAgents: 1,
    timeoutMs: 40_000,
  },

  analytics_agent: {
    agent: "analytics_agent",
    maxIterations: 2,
    tools: ["query_memory", "web_search", "find_similar"],
    useExtendedThinking: true,
    thinkingBudget: 4_000,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: true, threshold: 3.0 },
    },
    maxRetries: 1,
    maxSubAgents: 1,
    timeoutMs: 45_000,
  },

  competitive_monitor: {
    agent: "competitive_monitor",
    maxIterations: 3,
    tools: ["web_search", "extract_url", "query_memory"],
    useExtendedThinking: true,
    thinkingBudget: 5_000,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: true, threshold: 3.0 },
    },
    maxRetries: 1,
    maxSubAgents: 0,
    timeoutMs: 60_000,
  },

  seo_agent: {
    agent: "seo_agent",
    maxIterations: 4,
    tools: ["web_search", "extract_url", "query_memory"],
    useExtendedThinking: true,
    thinkingBudget: 6_000,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: true, threshold: 3.0 },
    },
    maxRetries: 1,
    maxSubAgents: 0,
    timeoutMs: 75_000,
  },

  blog_writer: {
    agent: "blog_writer",
    maxIterations: 4,
    tools: ["web_search", "extract_url"],
    useExtendedThinking: true,
    thinkingBudget: 10_000,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: true, threshold: 3.0 },
    },
    maxRetries: 2,
    maxSubAgents: 0,
    timeoutMs: 90_000,
    reflectionEnabled: true,
  },

  // ── Frontier AI Agents ──────────────────────────────────────────

  video_generator: {
    agent: "video_generator",
    maxIterations: 3,
    tools: ["query_memory", "web_search"],
    useExtendedThinking: false,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: true, threshold: 3.0 },
    },
    maxRetries: 1,
    maxSubAgents: 0,
    timeoutMs: 45_000,
  },

  social_media_manager: {
    agent: "social_media_manager",
    maxIterations: 3,
    tools: ["query_memory", "web_search", "find_similar"],
    useExtendedThinking: false,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: true, threshold: 3.0 },
    },
    maxRetries: 1,
    maxSubAgents: 0,
    timeoutMs: 45_000,
  },

  sales_sequencer: {
    agent: "sales_sequencer",
    maxIterations: 5,
    tools: ["web_search", "extract_url", "query_memory", "update_memory"],
    useExtendedThinking: true,
    thinkingBudget: 8_000,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: true, threshold: 3.5 },
    },
    maxRetries: 1,
    maxSubAgents: 1,
    timeoutMs: 90_000,
    maxToolResultChars: 12_000,
    reflectionEnabled: true,
    maxEstimatedTokens: 80_000,
  },

  // ── Artha Ops Agents ──────────────────────────────────────────────

  artha_growth: {
    agent: "artha_growth",
    maxIterations: 2,
    tools: ["query_memory", "web_search"],
    useExtendedThinking: false,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: false, threshold: 3.0 },
    },
    maxRetries: 1,
    maxSubAgents: 0,
    timeoutMs: 45_000,
  },

  artha_support: {
    agent: "artha_support",
    maxIterations: 2,
    tools: ["query_memory"],
    useExtendedThinking: false,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: true, threshold: 3.0 },
    },
    maxRetries: 1,
    maxSubAgents: 0,
    timeoutMs: 30_000,
  },

  artha_sales: {
    agent: "artha_sales",
    maxIterations: 2,
    tools: ["query_memory"],
    useExtendedThinking: false,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: false, threshold: 3.0 },
    },
    maxRetries: 1,
    maxSubAgents: 0,
    timeoutMs: 30_000,
  },

  artha_analytics: {
    agent: "artha_analytics",
    maxIterations: 1,
    tools: ["query_memory"],
    useExtendedThinking: false,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: false, threshold: 3.0 },
    },
    maxRetries: 1,
    maxSubAgents: 0,
    timeoutMs: 60_000,
  },

  artha_ops: {
    agent: "artha_ops",
    maxIterations: 1,
    tools: [],
    useExtendedThinking: false,
    validationCriteria: undefined,
    maxRetries: 0,
    maxSubAgents: 0,
    timeoutMs: 15_000,
  },

  artha_product: {
    agent: "artha_product",
    maxIterations: 2,
    tools: ["query_memory", "web_search"],
    useExtendedThinking: false,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: true, threshold: 3.0 },
    },
    maxRetries: 1,
    maxSubAgents: 0,
    timeoutMs: 75_000,
  },

  artha_community: {
    agent: "artha_community",
    maxIterations: 1,
    tools: ["query_memory"],
    useExtendedThinking: false,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: false, threshold: 3.0 },
    },
    maxRetries: 1,
    maxSubAgents: 0,
    timeoutMs: 30_000,
  },

  shorts_pipeline: {
    agent: "shorts_pipeline",
    maxIterations: 3,
    tools: ["web_search", "query_memory"],
    useExtendedThinking: false,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: false, threshold: 3.0 },
    },
    maxRetries: 1,
    maxSubAgents: 0,
    timeoutMs: 60_000,
  },

  artha_video_growth: {
    agent: "artha_video_growth",
    maxIterations: 1,
    tools: ["web_search"],
    useExtendedThinking: false,
    validationCriteria: {
      structural: { requiredFields: ["summary"] },
      quality: { enabled: false, threshold: 3.0 },
    },
    maxRetries: 1,
    maxSubAgents: 0,
    timeoutMs: 60_000,
  },
};

// ── Execution Tiers ─────────────────────────────────────────────────

/**
 * Lean profile — used during onboarding pipeline where Artha pays.
 * Caps iterations, thinking budget, disables sub-agents.
 */
export const PIPELINE_OVERRIDES: AgenticOverrides = {
  maxIterations: 3,
  thinkingBudget: 4_000,
  maxRetries: 1,
  maxSubAgents: 0,
  qualityThreshold: 3.0,
};

/**
 * Full quality profile — used in chat when user is on their own credits.
 * Uses the AGENTIC_DEFAULTS as-is (no overrides needed).
 */
export const CHAT_OVERRIDES: AgenticOverrides = {};

// ── Config Getter ───────────────────────────────────────────────────

/**
 * Get the agentic configuration for an agent, optionally with runtime overrides.
 *
 * @param agent - The agent name
 * @param overrides - Optional runtime overrides (e.g., PIPELINE_OVERRIDES)
 * @returns Merged AgenticConfig
 */
export function getAgenticConfig(
  agent: AgentName,
  overrides?: AgenticOverrides,
): AgenticConfig {
  const base = AGENTIC_DEFAULTS[agent];
  if (!base) {
    throw new Error(`No agentic config for agent: ${agent}`);
  }
  if (!overrides) return { ...base };

  const merged = { ...base };

  if (overrides.maxIterations != null) {
    merged.maxIterations = Math.min(overrides.maxIterations, base.maxIterations);
  }
  if (overrides.thinkingBudget != null) {
    merged.thinkingBudget = overrides.thinkingBudget;
  }
  if (overrides.maxRetries != null) {
    merged.maxRetries = Math.min(overrides.maxRetries, base.maxRetries);
  }
  if (overrides.maxSubAgents != null) {
    merged.maxSubAgents = Math.min(overrides.maxSubAgents, base.maxSubAgents);
  }
  if (overrides.useExtendedThinking != null) {
    merged.useExtendedThinking = overrides.useExtendedThinking;
  }
  if (overrides.timeoutMs != null) {
    merged.timeoutMs = overrides.timeoutMs;
  }
  if (overrides.qualityThreshold != null && merged.validationCriteria?.quality) {
    merged.validationCriteria = {
      ...merged.validationCriteria,
      quality: {
        ...merged.validationCriteria.quality,
        threshold: overrides.qualityThreshold,
      },
    };
  }

  return merged;
}

/**
 * Convenience: get config for a specific execution source.
 */
export function getAgenticConfigForSource(
  agent: AgentName,
  source: "pipeline" | "chat",
  extraOverrides?: AgenticOverrides,
): AgenticConfig {
  const tierOverrides = source === "pipeline" ? PIPELINE_OVERRIDES : CHAT_OVERRIDES;

  // Merge tier overrides first, then extra overrides on top
  const merged = getAgenticConfig(agent, tierOverrides);
  if (!extraOverrides) return merged;

  // Apply extra overrides
  if (extraOverrides.maxIterations != null) merged.maxIterations = extraOverrides.maxIterations;
  if (extraOverrides.thinkingBudget != null) merged.thinkingBudget = extraOverrides.thinkingBudget;
  if (extraOverrides.maxRetries != null) merged.maxRetries = extraOverrides.maxRetries;
  if (extraOverrides.maxSubAgents != null) merged.maxSubAgents = extraOverrides.maxSubAgents;
  if (extraOverrides.useExtendedThinking != null) merged.useExtendedThinking = extraOverrides.useExtendedThinking;

  return merged;
}
