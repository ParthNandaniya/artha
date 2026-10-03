import type { ArthaOpsAgentName } from "@/lib/types";

export interface OpsAgentResult {
  success: boolean;
  agent: ArthaOpsAgentName;
  summary: string;
  actions: OpsAction[];
  tokensUsed: { input: number; output: number };
  error?: string;
}

export interface OpsAction {
  type: string; // 'tweet_draft', 'email_draft', 'report', 'alert', 'metric', etc.
  payload: Record<string, unknown>;
  requiresApproval: boolean;
}

export interface OpsAgentConfig {
  agent: ArthaOpsAgentName;
  enabled: boolean;
  dailyBudgetUsd: number;
  maxRunsPerDay: number;
  approvalRequired: boolean;
}

export const ARTHA_OPS_AGENT_CONFIGS: Record<ArthaOpsAgentName, OpsAgentConfig> = {
  artha_growth: {
    agent: "artha_growth",
    enabled: true,
    dailyBudgetUsd: 0.50,
    maxRunsPerDay: 6,
    approvalRequired: true,
  },
  artha_support: {
    agent: "artha_support",
    enabled: true,
    dailyBudgetUsd: 0.50,
    maxRunsPerDay: 53,
    approvalRequired: false,
  },
  artha_sales: {
    agent: "artha_sales",
    enabled: true,
    dailyBudgetUsd: 0.30,
    maxRunsPerDay: 12,
    approvalRequired: true,
  },
  artha_analytics: {
    agent: "artha_analytics",
    enabled: true,
    dailyBudgetUsd: 0.20,
    maxRunsPerDay: 2,
    approvalRequired: false,
  },
  artha_ops: {
    agent: "artha_ops",
    enabled: true,
    dailyBudgetUsd: 0.10,
    maxRunsPerDay: 96,
    approvalRequired: false,
  },
  artha_product: {
    agent: "artha_product",
    enabled: true,
    dailyBudgetUsd: 0.10,
    maxRunsPerDay: 1,
    approvalRequired: false,
  },
  artha_community: {
    agent: "artha_community",
    enabled: true,
    dailyBudgetUsd: 0.30,
    maxRunsPerDay: 24,
    approvalRequired: true,
  },
};
