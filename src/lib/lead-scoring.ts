/**
 * Deterministic lead scoring engine.
 *
 * Replaces subjective LLM-assigned 0-100 scores with a formula-based
 * approach using weighted signal dimensions. The agent provides raw
 * signal data (0-1 per dimension), and this module computes the final
 * score consistently across runs.
 */

// ── Signal Types ─────────────────────────────────────────────────────

export interface LeadSignals {
  /** 0-1: How explicitly they expressed the pain point (0 = none, 1 = "I desperately need this") */
  painExpression: number;
  /** 0-1: Decision-making authority (0 = unknown, 0.3 = IC, 0.5 = manager, 0.7 = director, 1 = C-suite/VP/founder) */
  authority: number;
  /** 0-1: How closely their stated need matches the product (0 = tangential, 1 = exact match) */
  relevance: number;
  /** Days since their most recent public activity/post about this topic */
  recencyDays: number;
  /** 0-1: Company stage/size fit for the product (0 = wrong segment, 1 = ideal ICP match) */
  companyFit: number;
  /** Whether the lead was found on 2+ platforms (Reddit + Twitter, etc.) */
  multiPlatform: boolean;
}

export interface ScoredLead {
  score: number;
  breakdown: Record<string, number>;
}

// ── Scoring Weights ──────────────────────────────────────────────────

const WEIGHTS = {
  painExpression: 25,
  authority: 20,
  relevance: 20,
  recency: 15,
  companyFit: 10,
  engagementSignal: 10,
} as const;

// ── Scoring Function ─────────────────────────────────────────────────

/**
 * Score a lead deterministically based on weighted signal dimensions.
 * Returns a 0-100 score and per-dimension breakdown.
 */
export function scoreLead(signals: LeadSignals): ScoredLead {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));

  // Convert recency days to a 0-1 signal (more recent = higher)
  const recencySignal = signals.recencyDays <= 0
    ? 1.0                                                   // today
    : signals.recencyDays <= 7
      ? 0.9                                                 // this week
      : signals.recencyDays <= 30
        ? 0.7                                               // this month
        : signals.recencyDays <= 90
          ? 0.4                                             // this quarter
          : signals.recencyDays <= 365
            ? 0.2                                           // this year
            : 0.05;                                         // older

  const engagementSignal = signals.multiPlatform ? 1.0 : 0.3;

  const breakdown: Record<string, number> = {
    painExpression: Math.round(clamp(signals.painExpression) * WEIGHTS.painExpression),
    authority: Math.round(clamp(signals.authority) * WEIGHTS.authority),
    relevance: Math.round(clamp(signals.relevance) * WEIGHTS.relevance),
    recency: Math.round(recencySignal * WEIGHTS.recency),
    companyFit: Math.round(clamp(signals.companyFit) * WEIGHTS.companyFit),
    engagementSignal: Math.round(engagementSignal * WEIGHTS.engagementSignal),
  };

  const score = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown,
  };
}

// ── Batch Scoring ────────────────────────────────────────────────────

/**
 * Re-score an array of leads that have raw signal data in their metadata.
 * Falls back to the agent's original score if signals are missing.
 */
export function rescoreLeads<T extends { score: number; metadata?: Record<string, unknown> }>(
  leads: T[],
): (T & { scoreBreakdown?: Record<string, number> })[] {
  return leads.map((lead) => {
    const signals = lead.metadata?.signals as LeadSignals | undefined;
    if (!signals) return lead;

    const { score, breakdown } = scoreLead(signals);
    return { ...lead, score, scoreBreakdown: breakdown };
  });
}
