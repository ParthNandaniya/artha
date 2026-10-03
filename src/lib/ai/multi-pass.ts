import { generateAgentJSON } from "@/lib/ai/agent-model-router";

// ── Types ───────────────────────────────────────────────────────────

export interface MultiPassConfig<T> {
  /** Optional: gather context before generation (web search, memory, etc.) */
  researchFn?: () => Promise<string>;
  /** Optional: create an outline/plan before full generation */
  planFn?: (researchContext: string) => Promise<string>;
  /** Main generation function — receives research context and optional plan */
  generateFn: (context: string, plan?: string) => Promise<T>;
  /** Optional: evaluate output quality. Returns score (1-5) and feedback */
  critiqueFn?: (output: T, context: string) => Promise<CritiqueResult>;
  /** Optional: refine output using critique feedback */
  refineFn?: (output: T, feedback: string, context: string) => Promise<T>;
  /** Max refinement passes (default: 1) */
  maxRefinements?: number;
  /** Quality threshold — skip refinement if score >= this (default: 3.5) */
  qualityThreshold?: number;
}

export interface CritiqueResult {
  score: number;
  feedback: string;
  /** Per-dimension scores for detailed tracking */
  dimensions?: Record<string, number>;
}

export interface MultiPassResult<T> {
  result: T;
  /** Total passes (1 = no refinement, 2 = one refinement, etc.) */
  passes: number;
  /** Research context gathered (if any) */
  researchContext?: string;
  /** Critique results from each pass */
  critiques: CritiqueResult[];
  /** Plan/outline generated (if any) */
  plan?: string;
}

// ── Core Multi-Pass Runner ──────────────────────────────────────────

/**
 * Runs a multi-pass AI generation pipeline:
 *   research (optional) → plan (optional) → generate → critique → refine
 *
 * Each system defines its own research/generate/critique/refine logic.
 * This utility handles the orchestration and quality gating.
 */
export async function multiPass<T>(config: MultiPassConfig<T>): Promise<MultiPassResult<T>> {
  const maxRefinements = config.maxRefinements ?? 1;
  const qualityThreshold = config.qualityThreshold ?? 3.5;
  const critiques: CritiqueResult[] = [];

  // ── Step 1: Research ──────────────────────────────────────────
  let researchContext = "";
  if (config.researchFn) {
    try {
      researchContext = await config.researchFn();
    } catch (err) {
      console.warn("[multi-pass] Research phase failed, continuing without context:", err);
    }
  }

  // ── Step 2: Plan ──────────────────────────────────────────────
  let plan: string | undefined;
  if (config.planFn) {
    try {
      plan = await config.planFn(researchContext);
    } catch (err) {
      console.warn("[multi-pass] Plan phase failed, continuing without plan:", err);
    }
  }

  // ── Step 3: Generate ──────────────────────────────────────────
  let result = await config.generateFn(researchContext, plan);
  let passes = 1;

  // ── Step 4: Critique + Refine loop ────────────────────────────
  if (config.critiqueFn && config.refineFn) {
    for (let i = 0; i < maxRefinements; i++) {
      try {
        const critique = await config.critiqueFn(result, researchContext);
        critiques.push(critique);

        if (critique.score >= qualityThreshold) {
          break; // Quality is good enough
        }

        // Refine with critique feedback
        result = await config.refineFn(result, critique.feedback, researchContext);
        passes++;
      } catch (err) {
        console.warn(`[multi-pass] Critique/refine pass ${i + 1} failed:`, err);
        break;
      }
    }
  } else if (config.critiqueFn) {
    // Critique-only (no refine): just log the quality
    try {
      const critique = await config.critiqueFn(result, researchContext);
      critiques.push(critique);
    } catch {
      // Non-blocking
    }
  }

  return { result, passes, researchContext, critiques, plan };
}

// ── Lightweight Critique Helper ─────────────────────────────────────

/**
 * Fast, cheap critique using GPT-4o-mini. Evaluates only completeness
 * and actionability (2 dimensions). Good for free tools and quick checks.
 *
 * Returns score (1-5 average) and brief feedback.
 */
export async function lightweightCritique(
  output: string,
  taskDescription: string,
): Promise<CritiqueResult> {
  const systemPrompt = `You are a fast quality checker. Evaluate this AI output on 2 dimensions:
- Completeness (1-5): Does it fully address the task? Any obvious gaps?
- Actionability (1-5): Can someone act on this immediately?

Be strict. Score 3 = meets basic requirements. Return JSON only.`;

  const userPrompt = `Task: ${taskDescription.slice(0, 300)}

Output to evaluate:
${output.slice(0, 2000)}

Return: { "completeness": <1-5>, "actionability": <1-5>, "feedback": "<brief fix suggestions or 'Looks good.'>" }`;

  try {
    const result = await generateAgentJSON<{
      completeness: number;
      actionability: number;
      feedback: string;
    }>("free_tool", systemPrompt, userPrompt, { maxTokens: 200 });

    const score = (result.completeness + result.actionability) / 2;
    return {
      score,
      feedback: result.feedback,
      dimensions: {
        completeness: result.completeness,
        actionability: result.actionability,
      },
    };
  } catch {
    // Non-blocking — return passing score on failure
    return { score: 3.5, feedback: "Quality check unavailable." };
  }
}

// ── Content Critique Helper ─────────────────────────────────────────

/**
 * Mid-weight critique for content generation (blogs, mission docs, etc.).
 * Uses Sonnet for nuanced evaluation across 4 dimensions.
 */
export async function contentCritique(
  content: string,
  contentType: string,
  criteria: string,
): Promise<CritiqueResult> {
  const systemPrompt = `You are a content quality judge. Evaluate this ${contentType} on:
- Specificity (1-5): Does it use concrete details, not generic filler?
- Depth (1-5): Does it go beyond surface-level? Real insights?
- Structure (1-5): Clear headings, logical flow, scannable?
- Uniqueness (1-5): Would this stand out vs. generic AI output?

${criteria}

Be strict — most AI output is generic (score 2-3). Only score 4+ for genuinely specific, insightful content.`;

  const userPrompt = `Content to evaluate:
${content.slice(0, 3000)}

Return JSON: { "specificity": <1-5>, "depth": <1-5>, "structure": <1-5>, "uniqueness": <1-5>, "feedback": "<specific improvements>" }`;

  try {
    const result = await generateAgentJSON<{
      specificity: number;
      depth: number;
      structure: number;
      uniqueness: number;
      feedback: string;
    }>("quality_judge", systemPrompt, userPrompt, { maxTokens: 400 });

    const score = (result.specificity + result.depth + result.structure + result.uniqueness) / 4;
    return {
      score,
      feedback: result.feedback,
      dimensions: {
        specificity: result.specificity,
        depth: result.depth,
        structure: result.structure,
        uniqueness: result.uniqueness,
      },
    };
  } catch {
    return { score: 3.5, feedback: "Content critique unavailable." };
  }
}
