import { createHash } from "node:crypto";
import type { AgentInput, AgentOutput } from "./types";
import { runAgentic } from "./framework/agentic-runner";
import { validateOutput } from "./framework/validation";
import { getAgenticConfigForSource } from "@/config/agent-agentic-config";
import { getAgentModelConfig } from "@/config/agent-models";
import { summarizeContentForMemory } from "@/lib/personalization";

export async function runSeoAgent(input: AgentInput): Promise<AgentOutput> {
  const progress = input.onProgress || (() => {});
  const source = (input.metadata?.executionSource as "pipeline" | "chat") || "chat";
  const config = getAgenticConfigForSource("seo_agent", source);
  const modelConfig = getAgentModelConfig("seo_agent");

  try {
    progress("Starting SEO analysis...");

    const systemPrompt = `You are an SEO specialist for an early-stage startup. You have access to web search, URL extraction, and memory tools — use them proactively.

Your workflow:
1. FIRST, use web_search 2-3 times with targeted queries to research relevant keywords, competitor SEO strategies, and content gaps in the company's niche
2. Use extract_url to analyze competitor pages (their meta tags, content structure, top-ranking pages)
3. Use query_memory to check what we know about the company's current website, content, and target audience
4. Perform keyword research by searching for high-intent terms in the company's space
5. Synthesize findings into an actionable SEO strategy with specific recommendations

CRITICAL RULES:
- Only recommend keywords and strategies based on real search data found via your research. NEVER fabricate search volumes or rankings.
- Be specific: include actual keyword phrases, competitor URLs, and concrete meta tag suggestions
- Prioritize quick wins — low-competition, high-relevance keywords the company can rank for
- Include content gap analysis: topics competitors cover that the company doesn't
- Suggest specific blog post outlines with target keywords and estimated difficulty
- Provide exact meta title and description recommendations when applicable

Data presentation rules (CRITICAL — follow these exactly):
- This document must be completely self-contained. All data, metrics, and comparisons must be embedded directly in the markdown.
- Use markdown tables extensively for comparisons, metrics, breakdowns, and any structured data
- Include a \`## Key Metrics Snapshot\` section with a detailed markdown table (columns: Metric, Value, Context)
- Use bold text for key numbers and takeaways within paragraphs
- Do NOT reference external charts or visuals — all data must be inline as tables and formatted text
- When comparing items (competitors, channels, personas, etc.), always use a markdown table, never just a list
- Include a keyword opportunity table (Keyword, Estimated Difficulty, Relevance, Priority)
- Include a competitor SEO comparison table and a content gap table

Your final output MUST be JSON with:
- title: specific report title (e.g. "SEO Strategy: 20 High-Intent Keywords for AI DevOps Tools")
- content: full Markdown report with sections: Executive Summary, Key Metrics Snapshot, Keyword Opportunities, Competitor SEO Analysis, Content Gap Analysis, Meta Tag Recommendations, Blog Post Outlines, Technical SEO Quick Wins
- keyFindings: 3-5 actionable SEO insights
- blogOutlines: array of { title, targetKeyword, outline, estimatedDifficulty } for recommended blog posts
- metaRecommendations: array of { page, title, description } for meta tag improvements
- summary: one-line summary of results

Return ONLY valid JSON — no markdown fences, no explanation outside the JSON.`;

    const runnerOutput = await runAgentic(
      {
        systemPrompt,
        userPrompt: input.prompt,
        context: input.context,
        agentInput: input,
        config,
        model: modelConfig.model,
        provider: modelConfig.provider,
      },
      (output, cfg) => validateOutput(output, cfg, input.prompt),
    );

    const result = runnerOutput.result;

    // Convert blog outlines and meta recommendations into tasksCreated
    if (result.success && result.documents?.length) {
      const doc = result.documents[0];
      const title = doc.title || "SEO strategy report";
      const content = doc.content || result.summary;
      const keyFindings = (doc.metadata?.keyFindings as string[]) || [];
      const blogOutlines = (doc.metadata?.blogOutlines as Array<{ title: string; targetKeyword: string; estimatedDifficulty: string }>) || [];
      const metaRecommendations = (doc.metadata?.metaRecommendations as Array<{ page: string; title: string; description: string }>) || [];

      const tasks: AgentOutput["tasksCreated"] = [];

      // Create tasks for blog posts to write
      for (const blog of blogOutlines.slice(0, 5)) {
        tasks.push({
          title: `Write blog post: ${blog.title}`,
          description: `Target keyword: ${blog.targetKeyword}. Estimated difficulty: ${blog.estimatedDifficulty || "medium"}.`,
          type: "blog_post",
          tag: "seo",
          agent: "seo_agent",
        });
      }

      // Create tasks for meta tag updates
      if (metaRecommendations.length > 0) {
        tasks.push({
          title: `Update meta tags for ${metaRecommendations.length} page(s)`,
          description: metaRecommendations
            .slice(0, 5)
            .map((m) => `${m.page}: title="${m.title}", desc="${m.description}"`)
            .join("\n"),
          type: "meta_update",
          tag: "seo",
          agent: "seo_agent",
        });
      }

      if (tasks.length > 0) {
        result.tasksCreated = tasks;
      }

      result.supermemoryIngestions = [{
        content: buildSeoMemorySummary(title, content, keyFindings, blogOutlines),
        customId: `seo_agent_${input.projectId}_${stableHash(input.prompt)}`,
        dedupeKey: `seo_agent:${input.projectId}:${stableHash(input.prompt)}`,
        metadata: { type: "seo_agent" },
      }];
      result.links = [{ label: "View SEO report", url: "#research" }];

      // Write to scratchpad for downstream agents
      if (input.scratchpad && keyFindings.length > 0) {
        input.scratchpad.write("seo_agent.keyFindings", keyFindings);
        input.scratchpad.write("seo_agent.blogPostCount", blogOutlines.length);
      }
    }

    return result;
  } catch (error) {
    return {
      success: false,
      agent: "seo_agent",
      summary: "SEO analysis failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function stableHash(prompt: string): string {
  return createHash("sha256").update(prompt.trim().toLowerCase()).digest("hex").slice(0, 12);
}

function buildSeoMemorySummary(
  title: string,
  content: string,
  keyFindings: string[],
  blogOutlines: Array<{ title: string; targetKeyword: string }>,
): string {
  const blogSummary = blogOutlines
    .slice(0, 5)
    .map((b) => `"${b.title}" (${b.targetKeyword})`)
    .join(" | ");

  return [
    `SEO strategy: ${title}`,
    keyFindings.length ? `Key Findings: ${keyFindings.slice(0, 5).join(" | ")}` : "",
    blogSummary ? `Recommended Posts: ${blogSummary}` : "",
    `Summary: ${summarizeContentForMemory(content, 700)}`,
  ].filter(Boolean).join("\n");
}
