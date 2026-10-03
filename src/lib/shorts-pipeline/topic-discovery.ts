/**
 * Trending Topic Discovery
 *
 * Discovers viral/trending topics from multiple sources,
 * then uses AI to rank them by virality potential for short-form video.
 */

import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { searchWeb } from "@/lib/search";
import type { ContentCategory, DiscoveredTopic, TopicSource } from "./types";

// ── Source fetchers ─────────────────────────────────────────────────

async function fetchRedditHot(subreddits: string[], limit = 5): Promise<{ topic: string; source: TopicSource; data: string }[]> {
  const results: { topic: string; source: TopicSource; data: string }[] = [];

  for (const sub of subreddits) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=${limit}`, {
        headers: { "User-Agent": "ArthaPipeline/1.0" },
      });
      if (!res.ok) continue;

      const json = await res.json();
      const posts = json?.data?.children || [];
      for (const post of posts) {
        const d = post.data;
        if (d.stickied || d.over_18) continue;
        results.push({
          topic: d.title,
          source: "reddit",
          data: `r/${sub} | ${d.score} upvotes | ${d.num_comments} comments | ${d.url}`,
        });
      }
    } catch {
      // Silently skip failed subreddits
    }
  }

  return results;
}

async function fetchTrendingFromWeb(focus?: string): Promise<{ topic: string; source: TopicSource; data: string }[]> {
  const queries = [
    "trending AI news today",
    "viral tech twitter today",
    focus ? `trending ${focus} 2026` : "trending startup news today",
  ];

  const results: { topic: string; source: TopicSource; data: string }[] = [];

  for (const query of queries) {
    try {
      const searchResults = await searchWeb(query, { maxResults: 5 });
      for (const r of searchResults.results.slice(0, 3)) {
        results.push({
          topic: r.title,
          source: "web_search",
          data: `${r.url} — ${r.content.slice(0, 200)}`,
        });
      }
    } catch {
      // Skip failed searches
    }
  }

  return results;
}

// ── AI ranking ──────────────────────────────────────────────────────

interface RankedTopicsResponse {
  topics: {
    topic: string;
    category: ContentCategory;
    reasoning: string;
    trendScore: number;
    scriptAngle: string;
  }[];
}

async function rankTopics(
  rawTopics: { topic: string; source: TopicSource; data: string }[],
  recentTopics: string[],
): Promise<DiscoveredTopic[]> {
  if (rawTopics.length === 0) return [];

  const systemPrompt = `You are a viral short-form video content strategist. Your job is to pick the BEST topics for 15-60 second videos that will get maximum views on Twitter and Bluesky.

VIRAL CONTENT RULES:
- Topics must be TIMELY — trending right now, not evergreen
- Must trigger emotion: surprise, curiosity, outrage, inspiration, or humor
- Must be explainable in 60 seconds — no complex multi-part topics
- Must have a clear "hook" that stops the scroll in 2 seconds
- Avoid topics that require visual demos (we use text/voiceover videos)
- Prefer: hot takes, surprising stats, counterintuitive insights, "did you know", predictions

CATEGORIES:
- ai_tips: AI tools, prompts, workflows, productivity hacks
- tech_trends: Breaking tech news, product launches, industry shifts
- build_in_public: Startup metrics, founder lessons, growth hacks
- startup_advice: Business strategy, fundraising, hiring, scaling

AVOID these recent topics (already covered):
${recentTopics.slice(0, 10).map((t) => `- ${t}`).join("\n")}

Return JSON with "topics" array. Each topic: { topic (reworded for virality), category, reasoning, trendScore (1-10), scriptAngle (one sentence on how to frame the video) }.
Pick the top 3-5 best topics. Return ONLY valid JSON.`;

  const userPrompt = `Here are ${rawTopics.length} candidate topics from various sources:\n\n${rawTopics
    .map((t, i) => `${i + 1}. [${t.source}] ${t.topic}\n   Context: ${t.data}`)
    .join("\n\n")}`;

  const result = await generateAgentJSON<RankedTopicsResponse>(
    "shorts_topic_discovery",
    systemPrompt,
    userPrompt,
    { maxTokens: 2000 },
  );

  return (result.topics || []).map((t) => ({
    topic: t.topic,
    source: rawTopics.find((r) => r.topic.toLowerCase().includes(t.topic.toLowerCase().slice(0, 20)))?.source || "web_search",
    reasoning: t.reasoning,
    trendScore: t.trendScore,
    researchData: t.scriptAngle,
    category: t.category,
  }));
}

// ── Public API ───────────────────────────────────────────────────────

export async function discoverTrendingTopics(options?: {
  focus?: string;
  count?: number;
  recentTopics?: string[];
}): Promise<DiscoveredTopic[]> {
  const focus = options?.focus;
  const recentTopics = options?.recentTopics || [];

  // Fetch from multiple sources in parallel
  const [redditTopics, webTopics] = await Promise.all([
    fetchRedditHot(["artificial", "technology", "startups", "ChatGPT", "SaaS"], 5),
    fetchTrendingFromWeb(focus),
  ]);

  const allTopics = [...redditTopics, ...webTopics];

  if (allTopics.length === 0) {
    // Fallback: generate topics from scratch
    const fallback = await generateAgentJSON<RankedTopicsResponse>(
      "shorts_topic_discovery",
      "Generate 3 trending viral short-form video topics about AI, startups, or tech that would perform well on Twitter and Bluesky today. Return JSON with 'topics' array.",
      `Today is ${new Date().toISOString().slice(0, 10)}. Recent topics to avoid: ${recentTopics.slice(0, 5).join(", ")}`,
      { maxTokens: 1500 },
    );
    return (fallback.topics || []).map((t) => ({
      topic: t.topic,
      source: "web_search" as TopicSource,
      reasoning: t.reasoning,
      trendScore: t.trendScore,
      researchData: t.scriptAngle,
      category: t.category,
    }));
  }

  const ranked = await rankTopics(allTopics, recentTopics);
  return ranked.slice(0, options?.count || 3);
}
