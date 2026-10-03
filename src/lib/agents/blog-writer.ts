import { generateAgentJSON, generateAgentCompletion } from "@/lib/ai/agent-model-router";
import { generateSlug } from "@/lib/blog";
import { multiPass, contentCritique } from "@/lib/ai/multi-pass";
import { searchWebMulti } from "@/lib/search";

export interface BlogWriterInput {
  mode: "thread_expansion" | "fresh_research";
  threadContent?: string;
  threadTopic?: string;
  recentTitles?: string[];
}

export interface BlogWriterOutput {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
}

const VISUAL_GUIDELINES = `
VISUAL CONTENT RULES (CRITICAL — follow exactly):
You MUST include 2-3 inline SVG data visualizations in each post. These make the content scannable and shareable.

Types of visuals to use:
1. **Bar charts** — for comparing metrics, tools, or approaches
2. **Flow diagrams** — for showing processes or decision trees
3. **Comparison tables** — styled HTML tables with gradient headers
4. **Stat cards** — grid of highlighted numbers with labels
5. **Timeline graphics** — for step-by-step processes

SVG Style Rules:
- Use these brand colors: #1a1a1a (dark), #f97316 (orange accent), #3b82f6 (blue), #10b981 (green), #8b5cf6 (purple), #f59e0b (amber)
- SVGs must have viewBox, width="100%", max-height="300px"
- Use rounded rectangles (rx="8"), clean sans-serif fonts (font-family="system-ui, sans-serif")
- Add subtle gray gridlines for charts
- All SVGs wrapped in <figure class="blog-visual"><figcaption>Caption</figcaption></figure>

Styled callout boxes:
- Key takeaways: <div class="callout callout-key">...</div>
- Tips: <div class="callout callout-tip">...</div>
- Warnings: <div class="callout callout-warn">...</div>

Stat card grids:
<div class="stat-grid">
  <div class="stat-card"><div class="stat-value">85%</div><div class="stat-label">Description</div></div>
  ...
</div>
`;

const BASE_SYSTEM = `You are the blog writer for Artha (artha.run) — an AI platform that builds and runs companies from a single prompt. You write for tech founders, indie hackers, and solopreneurs.

Content standards:
- 800–1500 words, well-structured with H2/H3 headings
- Smart, direct, opinionated tone — like a founder sharing hard-won knowledge
- Include real data and specific examples (not generic advice)
- Every post must teach something actionable
- Reference Artha naturally where relevant (not forced)
- No fluff, no filler, no "in today's fast-paced world" type openings
- Open with a hook: a surprising stat, a bold claim, or a real scenario

HTML formatting rules:
- Use semantic HTML: <h2>, <h3>, <p>, <ul>, <ol>, <blockquote>, <code>, <pre>
- Wrap code snippets in <pre><code class="language-X">...</code></pre>
- Use <strong> for emphasis, not <b>
- Add id attributes to H2 headings for anchor links (e.g. <h2 id="section-name">)
- Do NOT include <html>, <head>, <body>, or <style> tags — just the article content HTML

${VISUAL_GUIDELINES}

Topic categories to rotate through:
1. "How Artha automates X" — behind-the-scenes technical deep dives
2. "SaaS growth playbooks" — tactical advice for founders (pricing, distribution, retention)
3. "AI agent patterns" — technical posts on multi-agent systems, tool use, orchestration
4. "Build in public" — Artha's metrics, architecture decisions, learnings
5. "Industry trends" — AI/SaaS market analysis with real data
6. "Founder playbooks" — step-by-step guides for common startup challenges

Return ONLY valid JSON with these fields:
{
  "title": "string — compelling, specific title (no clickbait, 50-70 chars)",
  "slug": "string — URL-friendly slug",
  "excerpt": "string — 1-2 sentence summary for listing pages and meta description",
  "content": "string — full article HTML with inline SVG visuals",
  "tags": ["string array — 2-4 relevant tags"],
  "seoTitle": "string — SEO-optimized title (may differ from display title, 50-60 chars)",
  "seoDescription": "string — meta description optimized for CTR (150-160 chars)"
}`;

export async function generateBlogPost(
  input: BlogWriterInput,
): Promise<BlogWriterOutput> {
  const avoidList = input.recentTitles?.length
    ? `\nAvoid these topics (already published): ${input.recentTitles.join(", ")}`
    : "";

  try {
    const multiPassResult = await multiPass<BlogWriterOutput>({
      // ── Research: web search for relevant data ──
      researchFn: async () => {
        const topic =
          input.mode === "thread_expansion" && input.threadTopic
            ? input.threadTopic
            : "AI startups SaaS founder growth tactics 2025";

        try {
          const results = await searchWebMulti(
            [
              `${topic} latest data statistics`,
              `${topic} founder insights trends`,
            ],
            {
              depth: "fast",
              maxResultsPerQuery: 3,
            },
          );

          const contextParts: string[] = [];
          for (const res of results) {
            if (res.results) {
              for (const r of res.results) {
                contextParts.push(
                  `- ${r.title}: ${r.content?.slice(0, 200) || r.url}`,
                );
              }
            }
          }
          return contextParts.length > 0
            ? `Web research findings:\n${contextParts.join("\n")}`
            : "";
        } catch {
          return "";
        }
      },

      // ── Plan: generate outline ──
      planFn: async (researchContext: string) => {
        const planPrompt =
          input.mode === "thread_expansion" && input.threadContent
            ? `Create a blog post outline expanding this thread:\nTopic: ${input.threadTopic || "unknown"}\nThread: ${input.threadContent.slice(0, 1000)}`
            : `Create a blog post outline for artha.run targeting tech founders.${avoidList}`;

        return generateAgentCompletion(
          "blog_writer",
          `You are an outline generator. Create a concise blog post outline with:
- 3-5 H2 section headings
- 2-3 key points per section
- Data points or statistics to include
- Where to place 2-3 SVG visualizations

${researchContext ? `Use this research:\n${researchContext}` : ""}

Return the outline as plain text.`,
          planPrompt,
          { maxTokens: 800 },
        );
      },

      // ── Generate: main blog generation ──
      generateFn: async (researchContext: string, plan?: string) => {
        let userPrompt: string;

        const contextBlock = [
          researchContext ? `\nResearch context:\n${researchContext}` : "",
          plan ? `\nOutline to follow:\n${plan}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        if (input.mode === "thread_expansion" && input.threadContent) {
          userPrompt = `Expand this Twitter thread into a full blog post. Keep the core insights but add depth, examples, data, and inline SVG visualizations.

Thread topic: ${input.threadTopic || "unknown"}
Thread content:
${input.threadContent}
${avoidList}
${contextBlock}

Write a comprehensive blog post that goes deeper than the thread. Add research, examples, and visual data to make it a definitive resource on this topic.`;
        } else {
          userPrompt = `Write a fresh, research-backed blog post for artha.run. Pick a topic that would rank well for SEO and genuinely help founders building with AI.
${avoidList}
${contextBlock}

Research what's trending in AI/SaaS/startup space right now and write about something timely and specific. Include real data points and create inline SVG charts to visualize key data.`;
        }

        return generateAgentJSON<BlogWriterOutput>(
          "blog_writer",
          BASE_SYSTEM,
          userPrompt,
        );
      },

      // ── Critique: evaluate blog quality ──
      critiqueFn: async (output: BlogWriterOutput) => {
        return contentCritique(
          output.content,
          "blog post",
          `Additional criteria to check:
- Word count should be 800-1500 words
- Must have clear H2 heading structure with id attributes
- Must contain 2-3 inline SVG elements with viewBox attributes
- Must include actionable takeaways (not just observations)
- Opening should be a hook (stat, bold claim, scenario) — not generic filler`,
        );
      },

      // ── Refine: re-generate with feedback ──
      refineFn: async (
        output: BlogWriterOutput,
        feedback: string,
        researchContext: string,
      ) => {
        const refinePrompt = `Here is a blog post that needs improvement. Rewrite it addressing the following feedback while keeping all good parts.

FEEDBACK:
${feedback}

CURRENT CONTENT:
Title: ${output.title}
Content (first 2000 chars): ${output.content.slice(0, 2000)}

${researchContext ? `Research context:\n${researchContext}` : ""}

Rewrite the full blog post addressing the feedback. Return the same JSON format.`;

        return generateAgentJSON<BlogWriterOutput>(
          "blog_writer",
          BASE_SYSTEM,
          refinePrompt,
        );
      },

      maxRefinements: 1,
      qualityThreshold: 3.5,
    });

    const result = multiPassResult.result;

    // Ensure slug is valid
    if (!result.slug || result.slug.length < 3) {
      result.slug = generateSlug(result.title);
    }

    // ── SVG validation: strip broken SVGs ──
    result.content = validateAndCleanSVGs(result.content);

    return result;
  } catch (error) {
    // Fallback: run the original single-pass generation
    console.warn("[blog-writer] Multi-pass failed, falling back to single-pass:", error);
    return generateBlogPostSinglePass(input, avoidList);
  }
}

/**
 * Validate SVGs in HTML content. Strips SVGs that lack a viewBox attribute
 * or have obviously malformed XML (unclosed tags, missing closing tag).
 */
function validateAndCleanSVGs(html: string): string {
  // Match each <svg ...>...</svg> block (non-greedy, case-insensitive)
  return html.replace(/<svg[\s\S]*?<\/svg>/gi, (svgMatch) => {
    // Must have viewBox attribute
    if (!/viewBox\s*=/i.test(svgMatch)) {
      console.warn("[blog-writer] Stripped SVG without viewBox");
      return "<!-- SVG removed: missing viewBox -->";
    }

    // Basic well-formedness: count opening vs closing tags for common elements
    const openTags = (svgMatch.match(/<(?!\/|!)[a-z][^>]*(?<!\/)\s*>/gi) || []).length;
    const closeTags = (svgMatch.match(/<\/[a-z][^>]*>/gi) || []).length;
    const selfClosing = (svgMatch.match(/<[a-z][^>]*\/\s*>/gi) || []).length;

    // Rough heuristic: if closing tags are way fewer than opens (minus self-closing), likely malformed
    if (openTags - selfClosing > closeTags + 3) {
      console.warn("[blog-writer] Stripped malformed SVG (tag mismatch)");
      return "<!-- SVG removed: malformed XML -->";
    }

    return svgMatch;
  });
}

/**
 * Original single-pass blog generation — used as fallback if multi-pass fails.
 */
async function generateBlogPostSinglePass(
  input: BlogWriterInput,
  avoidList: string,
): Promise<BlogWriterOutput> {
  let userPrompt: string;

  if (input.mode === "thread_expansion" && input.threadContent) {
    userPrompt = `Expand this Twitter thread into a full blog post. Keep the core insights but add depth, examples, data, and inline SVG visualizations.

Thread topic: ${input.threadTopic || "unknown"}
Thread content:
${input.threadContent}
${avoidList}

Write a comprehensive blog post that goes deeper than the thread. Add research, examples, and visual data to make it a definitive resource on this topic.`;
  } else {
    userPrompt = `Write a fresh, research-backed blog post for artha.run. Pick a topic that would rank well for SEO and genuinely help founders building with AI.
${avoidList}

Research what's trending in AI/SaaS/startup space right now and write about something timely and specific. Include real data points and create inline SVG charts to visualize key data.`;
  }

  const result = await generateAgentJSON<BlogWriterOutput>(
    "blog_writer",
    BASE_SYSTEM,
    userPrompt,
  );

  if (!result.slug || result.slug.length < 3) {
    result.slug = generateSlug(result.title);
  }

  return result;
}
