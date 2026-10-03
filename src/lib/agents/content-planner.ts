import type { AgentInput, AgentOutput } from "./types";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";

interface ContentPost {
  content: string;
  platform: string;
  scheduledAt: string;
  category: string;
}

interface ContentPlannerResponse {
  posts: ContentPost[];
  summary: string;
}

export async function runContentPlannerAgent(input: AgentInput): Promise<AgentOutput> {
  try {
    const progress = input.onProgress || (() => {});

    progress("Planning weekly content calendar...");
    const result = await generateAgentJSON<ContentPlannerResponse>(
      "content_planner",
      `You are a social media strategist for an early-stage startup. Generate a week of social media content that builds audience, drives engagement, and supports growth.

Content planning principles:
- Create a balanced mix of content types: educational (teach something valuable), behind-the-scenes (show the human side), social proof (customer wins, metrics, testimonials), and engagement questions (spark conversation)
- Each post must be under 280 characters for Twitter compatibility
- Suggest optimal posting times based on platform best practices (e.g. weekday mornings for B2B, evenings for B2C)
- Space posts across the week — avoid dumping everything on one day
- Each post should be standalone and valuable, not just filler
- Use a natural, authentic voice — no corporate jargon or excessive hashtags
- Include relevant hashtags only when they add discoverability (1-2 max per post)

Return JSON with:
posts: array of objects:
- content: the full post text (under 280 chars)
- platform: one of "twitter", "linkedin", "both"
- scheduledAt: ISO 8601 datetime string for when to post (use the upcoming week)
- category: one of "educational", "behind-the-scenes", "social-proof", "engagement", "announcement", "tip"

summary: one-line summary of the content plan (e.g. "7 posts across 5 days covering product tips, customer wins, and engagement threads")

Company Context:
${input.context}`,
      input.prompt || "Generate a week of social media content for this company",
      { maxTokens: 3000 }
    );

    progress("Content calendar generated.");
    const posts = result.posts || [];

    const output: AgentOutput = {
      success: true,
      agent: "content_planner",
      summary: result.summary || `Generated ${posts.length} posts for the week`,
      documents: [{
        type: "content_calendar",
        title: "Weekly Content Plan",
        content: posts.map((p) => `[${p.platform}] ${p.scheduledAt} (${p.category}): ${p.content}`).join("\n\n"),
        metadata: { posts },
      }],
      links: [{ label: "View content plan", url: "#content" }],
    };

    if (input.scratchpad) {
      input.scratchpad.write("content_planner.postCount", posts.length);
      input.scratchpad.write("content_planner.platforms", [...new Set(posts.map((p) => p.platform))]);
    }

    return output;
  } catch (error) {
    return {
      success: false,
      agent: "content_planner",
      summary: "Content planning failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
