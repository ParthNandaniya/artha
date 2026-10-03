import type { AgentOutput } from "../types";
import type { AgenticConfig, ValidationCriteria, ValidationResult } from "./types";
import { runQualityJudge } from "./quality-judge";

// ── Structural Validation ───────────────────────────────────────────

function validateStructural(
  output: AgentOutput,
  criteria: NonNullable<ValidationCriteria["structural"]>,
): { passed: boolean; errors: string[] } {
  const errors: string[] = [];

  // Required fields check
  if (criteria.requiredFields) {
    for (const field of criteria.requiredFields) {
      const value = (output as unknown as Record<string, unknown>)[field];
      if (value === undefined || value === null || value === "") {
        errors.push(`Missing required field: "${field}"`);
      }
      // Also check inside documents
      if (field === "content" && output.documents) {
        const hasContent = output.documents.some((d) => d.content && d.content.length > 50);
        if (!hasContent) {
          errors.push('Documents are empty or too short (expected substantial content in "content" field)');
        }
      }
    }
  }

  // Max length checks
  if (criteria.maxLength) {
    for (const [field, maxLen] of Object.entries(criteria.maxLength)) {
      // Check tweets specifically
      if (field === "tweet" && output.tweets) {
        for (const tweet of output.tweets) {
          if (tweet.content.length > maxLen) {
            errors.push(
              `Tweet exceeds ${maxLen} chars (got ${tweet.content.length}): "${tweet.content.slice(0, 50)}..."`,
            );
          }
        }
      }
      // Check generic fields
      const value = (output as unknown as Record<string, unknown>)[field];
      if (typeof value === "string" && value.length > maxLen) {
        errors.push(`Field "${field}" exceeds ${maxLen} chars (got ${value.length})`);
      }
    }
  }

  // HTML validation (basic checks)
  if (criteria.htmlValidation && output.pages) {
    for (const page of output.pages) {
      if (!page.html || page.html.length < 100) {
        errors.push("Page HTML is empty or too short");
      }
      if (!page.html.includes("<html") && !page.html.includes("<!DOCTYPE") && !page.html.includes("<div")) {
        errors.push("Page HTML appears to be missing basic HTML structure");
      }
      // Check for unclosed tags (basic)
      const openTags = (page.html.match(/<[a-z][^>]*>/gi) || []).length;
      const closeTags = (page.html.match(/<\/[a-z][^>]*>/gi) || []).length;
      if (Math.abs(openTags - closeTags) > 10) {
        errors.push(`HTML has significant tag imbalance (${openTags} open vs ${closeTags} close)`);
      }
    }
  }

  return { passed: errors.length === 0, errors };
}

// ── Combined Validation ─────────────────────────────────────────────

export async function validateOutput(
  output: AgentOutput,
  config: AgenticConfig,
  originalPrompt?: string,
): Promise<ValidationResult> {
  const criteria = config.validationCriteria;
  if (!criteria) {
    return { passed: true };
  }

  const result: ValidationResult = { passed: true };

  // Step 1: Structural validation (instant, free)
  if (criteria.structural) {
    const structural = validateStructural(output, criteria.structural);
    if (!structural.passed) {
      result.passed = false;
      result.structuralErrors = structural.errors;
      result.feedback = `Structural validation failed:\n${structural.errors.map((e) => `- ${e}`).join("\n")}`;
      // Skip quality judge if structural fails — fix structure first
      return result;
    }
  }

  // Step 2: Quality judge (LLM-based, ~$0.006/call with Sonnet)
  if (criteria.quality?.enabled) {
    const judgeResult = await runQualityJudge({
      agentName: config.agent,
      output,
      originalPrompt: originalPrompt || "",
      threshold: criteria.quality.threshold,
      weights: criteria.quality.weights,
      model: criteria.quality.model,
    });

    result.qualityScores = judgeResult.scores;

    if (!judgeResult.passed) {
      result.passed = false;
      result.feedback = judgeResult.feedback;
    }
  }

  return result;
}
