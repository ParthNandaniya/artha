import { getDb } from "@/lib/neon";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { runOpsAgent } from "./runner";
import { getPlatformMetrics } from "./tools/platform-metrics";
import type { OpsAction } from "./types";

interface GrowthContent {
  tweets: { content: string; type: string }[];
  summary: string;
}

async function getRecentBuilds() {
  const db = getDb();
  return db`
    SELECT p.name, p.slug, d.title AS mission_title,
           SUBSTRING(d.content FROM 1 FOR 200) AS mission_excerpt,
           p.created_at
    FROM projects p
    LEFT JOIN documents d ON d.project_id = p.id AND d.type = 'mission'
    WHERE p.status = 'active'
      AND p.landing_page_published = TRUE
      AND COALESCE(p.hidden, false) = false
      AND p.created_at >= NOW() - INTERVAL '24 hours'
    ORDER BY p.created_at DESC
    LIMIT 5
  `;
}

async function getRecentTweetTopics() {
  const db = getDb();
  const rows = await db`
    SELECT content FROM artha_ops_runs
    WHERE agent_name = 'artha_growth'
      AND status = 'completed'
      AND created_at >= NOW() - INTERVAL '48 hours'
    ORDER BY created_at DESC
    LIMIT 5
  `;
  return rows.map((r: Record<string, unknown>) => {
    try {
      const output = r.content as Record<string, unknown>;
      return output;
    } catch { return null; }
  }).filter(Boolean);
}

export async function runGrowthAgent(trigger: "cron" | "manual" = "cron") {
  return runOpsAgent("artha_growth", trigger, null, async () => {
    const metrics = await getPlatformMetrics();
    const recentBuilds = await getRecentBuilds();
    const recentTopics = await getRecentTweetTopics();
    const actions: OpsAction[] = [];

    const content = await generateAgentJSON<GrowthContent>(
      "artha_growth",
      `You are the growth marketing agent for Artha (artha.run), an AI company builder.
You create engaging tweets that showcase what Artha can do and attract builders/entrepreneurs.

Tweet types to mix:
- "showcase": Highlight a recently built company (anonymize if needed — use industry/niche, not names)
- "tip": Share a practical tip about building with AI agents
- "stat": Share an interesting platform metric
- "thought_leadership": Share an insight about AI-powered businesses

Guidelines:
- Keep tweets under 280 characters
- Be authentic, not corporate
- No hashtags spam (max 1-2 relevant ones)
- Vary the types — don't repeat what was posted recently
- Include a subtle CTA occasionally ("Try it at artha.run")

Return JSON: { tweets: [{ content, type }], summary: "1-line description" }`,
      `Platform metrics:
- ${metrics.totalProjects} companies built, ${metrics.activeProjects} active
- ${metrics.signupsToday} signups today, ${metrics.signupsThisWeek} this week
- ${metrics.totalTasksCompleted} total tasks completed

Recent builds (last 24h):
${recentBuilds.map((b: Record<string, unknown>) => `- ${b.name}: ${(b.mission_excerpt as string) || "No mission yet"}`).join("\n") || "None"}

Recently posted topics (avoid repeating):
${JSON.stringify(recentTopics)}

Generate 1-2 tweets for this posting cycle.`,
      { maxTokens: 1000 },
    );

    for (const tweet of content.tweets || []) {
      actions.push({
        type: "tweet_draft",
        payload: { content: tweet.content, tweetType: tweet.type },
        requiresApproval: true,
      });
    }

    return {
      success: true,
      agent: "artha_growth" as const,
      summary: content.summary || `Generated ${(content.tweets || []).length} tweets`,
      actions,
      tokensUsed: { input: 2000, output: 800 },
    };
  });
}
