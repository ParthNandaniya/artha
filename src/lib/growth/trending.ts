import { searchWebMulti } from "@/lib/search";
import { searchTweets, type SearchedTweet } from "@/lib/twitter";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { getRecentTopics } from "./scheduler";

// ── Types ───────────────────────────────────────────────────────────

export interface TrendingItem {
  headline: string;
  summary: string;
  sourceUrl: string;
  sourceType: "news" | "tweet";
  format: "hot_take" | "news_react" | "qrt" | "insight";
  viralityScore: number;
  tweetContext?: {
    authorUsername: string;
    tweetId: string;
    engagement: number;
  };
}

// ── Discovery: Brave Search + Twitter Search ────────────────────────

const isLocal = process.env.NODE_ENV !== "production";

// News + celebrity queries — geopolitics, war, celebrity tech (production only)
const NEWS_ONLY_QUERIES = [
  "Iran war latest news today",
  "Iran conflict tech impact today",
  "geopolitics war market impact today",
  "oil price today war",
  "defense startup funding war",
  "Sam Altman OpenAI news today",
  "Elon Musk latest news today",
];

// Tech, AI, startups & stocks queries — always included
const TECH_QUERIES = [
  "breaking AI news today",
  "AI tool viral trending today",
  "defense tech news today",
  "startup funding raised today",
  "tech layoffs hiring news today",
  "stock market crash OR surge today",
  "S&P 500 Nasdaq today big move",
  "NVIDIA Tesla Apple stock today",
  "$NVDA $TSLA $AAPL earnings today",
  "crypto bitcoin crash OR rally today",
];

const NEWS_QUERIES = isLocal ? TECH_QUERIES : [...NEWS_ONLY_QUERIES, ...TECH_QUERIES];

// News + celebrity Twitter queries (production only)
const TWITTER_NEWS_ONLY_QUERIES = [
  "(Iran OR war OR defense) (tech OR startup OR stock) min_faves:500 -is:retweet lang:en",
  "(Iran OR ceasefire OR sanctions) min_faves:1000 -is:retweet lang:en",
  "(from:elonmusk OR from:sama OR from:sataborasu) -is:retweet lang:en",
  "(from:pmarca OR from:chaaborasu OR from:garaborasu) -is:retweet lang:en",
  "(Marc Andreessen OR Jensen Huang OR Satya Nadella) -is:retweet lang:en min_faves:200",
  "(oil OR energy OR $XLE) (price OR surge OR crash) min_faves:300 -is:retweet lang:en",
];

// Tech, AI, startups & stocks Twitter queries — always included
const TWITTER_TECH_QUERIES = [
  "AI tool OR AI app min_faves:1000 -is:retweet lang:en",
  "(ChatGPT OR Claude OR Gemini OR GPT) min_faves:500 -is:retweet lang:en",
  "(launched OR shipping OR just dropped) AI min_faves:300 -is:retweet lang:en",
  "(defense tech OR Anduril OR Palantir OR Shield AI) min_faves:200 -is:retweet lang:en",
  "(raised OR funding OR acquired) startup min_faves:300 -is:retweet lang:en",
  "(stock OR market) (crash OR surge OR plunge OR soar OR rally) min_faves:500 -is:retweet lang:en",
  "($NVDA OR $TSLA OR $AAPL OR $MSFT OR $META OR $GOOG) min_faves:500 -is:retweet lang:en",
];

const TWITTER_QUERIES = isLocal ? TWITTER_TECH_QUERIES : [...TWITTER_NEWS_ONLY_QUERIES, ...TWITTER_TECH_QUERIES];

async function discoverFromSearch(): Promise<TrendingItem[]> {
  try {
    // Pick 3 random queries for broad coverage
    const shuffled = NEWS_QUERIES.sort(() => Math.random() - 0.5).slice(0, 3);
    const results = await searchWebMulti(shuffled, {
      engine: "brave",
      maxResultsPerQuery: 5,
      freshness: "pd", // past day
    });

    const items: TrendingItem[] = [];
    const seenUrls = new Set<string>();

    for (const response of results) {
      for (const result of response.results) {
        if (seenUrls.has(result.url)) continue;
        seenUrls.add(result.url);

        items.push({
          headline: result.title,
          summary: result.content.slice(0, 300),
          sourceUrl: result.url,
          sourceType: "news",
          format: "news_react",
          viralityScore: result.score,
        });
      }
    }

    return items;
  } catch (err) {
    console.error("[trending] Search discovery failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

async function discoverFromTwitter(): Promise<TrendingItem[]> {
  try {
    // Pick 3 random queries for variety
    const shuffled = TWITTER_QUERIES.sort(() => Math.random() - 0.5).slice(0, 3);

    const allTweets: SearchedTweet[] = [];
    for (const query of shuffled) {
      try {
        const tweets = await searchTweets(query, { maxResults: 15, sortOrder: "relevancy" });
        allTweets.push(...tweets);
      } catch (err) {
        console.error(`[trending] Twitter search failed for "${query}":`, err instanceof Error ? err.message : err);
      }
    }

    // Deduplicate and sort by engagement
    const seen = new Set<string>();
    const unique = allTweets.filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });

    // Sort by total engagement (likes + retweets + replies)
    unique.sort((a, b) => {
      const engA = a.metrics.likes + a.metrics.retweets * 3 + a.metrics.replies * 2;
      const engB = b.metrics.likes + b.metrics.retweets * 3 + b.metrics.replies * 2;
      return engB - engA;
    });

    // Take top 15
    return unique.slice(0, 15).map((tweet) => {
      const engagement = tweet.metrics.likes + tweet.metrics.retweets * 3 + tweet.metrics.replies * 2;
      return {
        headline: tweet.text.slice(0, 120),
        summary: tweet.text,
        sourceUrl: `https://x.com/${tweet.authorUsername}/status/${tweet.id}`,
        sourceType: "tweet" as const,
        format: engagement > 5000 ? "qrt" as const : "hot_take" as const,
        viralityScore: engagement,
        tweetContext: {
          authorUsername: tweet.authorUsername,
          tweetId: tweet.id,
          engagement,
        },
      };
    });
  } catch (err) {
    console.error("[trending] Twitter discovery failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

// ── Rank & Filter ───────────────────────────────────────────────────

export async function discoverTrending(): Promise<TrendingItem[]> {
  // Skip trending discovery entirely in local dev — no accidental posts
  if (isLocal) {
    console.log("[trending] Skipping — news posting disabled in local dev");
    return [];
  }

  // Run both discovery sources in parallel
  const [searchItems, twitterItems] = await Promise.all([
    discoverFromSearch(),
    discoverFromTwitter(),
  ]);

  const allItems = [...searchItems, ...twitterItems];

  if (allItems.length === 0) {
    console.log("[trending] No trending items found from any source");
    return [];
  }

  // Get recent topics to filter duplicates
  const recentTopics = await getRecentTopics("trending", 30);
  const recentLower = new Set(recentTopics.map((t) => t.toLowerCase()));

  // Filter out items that match recent topics
  const fresh = allItems.filter((item) => {
    const headline = item.headline.toLowerCase();
    return !recentLower.has(headline) &&
      !Array.from(recentLower).some((t) => headline.includes(t) || t.includes(headline));
  });

  if (fresh.length === 0) {
    console.log("[trending] All items filtered by dedup — nothing new");
    return [];
  }

  // AI ranking: pick the best items
  const ranked = await rankTrending(fresh);
  return ranked;
}

async function rankTrending(items: TrendingItem[]): Promise<TrendingItem[]> {
  // Prepare summaries for AI ranking
  const summaries = items.slice(0, 20).map((item, i) => ({
    index: i,
    headline: item.headline.slice(0, 100),
    summary: item.summary.slice(0, 200),
    sourceType: item.sourceType,
    engagement: item.viralityScore,
  }));

  try {
    const rankingPrompt = isLocal
      ? `You curate trending tech content for a viral tech-focused Twitter account.

Your goal: pick items that will get the MOST clicks, likes, retweets, and replies in the tech community.

Given these trending items, pick the TOP 5 most viral-worthy. Rank by:

1. AI/TECH NEWS — new AI tools, product launches, industry shifts, funding rounds
2. STOCK MARKET DRASTIC MOVES — any stock that moved 5%+ up or down, market crashes, rallies
3. STARTUP / VC — funding rounds, acquisitions, launches, pivots
4. DEFENSE TECH — Anduril, Palantir, Shield AI, military tech contracts
5. PSYCHOLOGICAL ENGAGEMENT — outrage, surprise, FOMO, controversy in tech

Skip any celebrity gossip and war/geopolitics content. Focus on tech, startups, and stocks.

For each pick, choose the best format:
- "hot_take" — bold opinionated one-liner that makes people agree or fight
- "news_react" — BREAKING/JUST IN style delivery (best for fresh tech news)
- "qrt" — react to a tweet with a spicy take
- "insight" — connect news to a bigger "here's what this really means" angle

Return JSON: { ranked: [{ index: number, format: "hot_take" | "news_react" | "qrt" | "insight", reason: string }] }

Items:
${JSON.stringify(summaries, null, 2)}`
      : `You curate trending/breaking content for a viral news-style Twitter account.

Your goal: pick items that will get the MOST clicks, likes, retweets, and replies. Think like a tabloid editor meets tech insider.

Given these trending items, pick the TOP 5 most viral-worthy. Rank by:

1. WAR / GEOPOLITICS — Iran conflict updates, defense tech deals, sanctions, oil disruptions, ceasefire talks.
   War content gets MASSIVE engagement because everyone has an opinion. Especially:
   - How war affects tech/startups/markets
   - Defense tech companies winning contracts
   - VCs and founders commenting on geopolitics
   - Civilian tech infrastructure under threat
2. STOCK MARKET DRASTIC MOVES — any stock that moved 5%+ up or down, market crashes, rallies, oil spikes.
   People panic-engage with money content. Include specific tickers and percentages.
3. CELEBRITY TECH / INFLUENCER — Elon, Sam Altman, Jensen Huang, Zuck, big tech CEOs saying anything.
   Name recognition = instant clicks. Even mundane tweets from these people go viral.
4. PSYCHOLOGICAL ENGAGEMENT — outrage, surprise, FOMO, controversy, "wait WHAT?" moments
5. AI/TECH NEWS — new AI tools, product launches, industry shifts, funding rounds

For each pick, choose the best format:
- "hot_take" — bold opinionated one-liner that makes people agree or fight (best for controversy, war takes)
- "news_react" — BREAKING/JUST IN style delivery (best for fresh news, stock moves, war updates)
- "qrt" — react to a celebrity/influencer tweet with a spicy take (best for Elon, Sam Altman tweets)
- "insight" — connect news to a bigger "here's what this really means" angle (best for market moves, geopolitics)

Return JSON: { ranked: [{ index: number, format: "hot_take" | "news_react" | "qrt" | "insight", reason: string }] }

Items:
${JSON.stringify(summaries, null, 2)}`;

    const rankingUserPrompt = isLocal
      ? "Pick the 5 most viral tech items. Prioritize: AI/tool launches > stock market moves > startup funding > defense tech. Skip celebrity gossip and war/geopolitics content."
      : "Pick the 5 most viral items. Prioritize: war/geopolitics impact > stock crashes/rallies > celebrity tech > AI news. If a stock moved drastically or a war update dropped, that ALWAYS wins over generic tech news.";

    const result = await generateAgentJSON<{
      ranked: Array<{ index: number; format: string; reason: string }>;
    }>(
      "twitter_growth",
      rankingPrompt,
      rankingUserPrompt
    );

    return result.ranked
      .map((r) => {
        const item = items[r.index];
        if (!item) return null;
        return {
          ...item,
          format: r.format as TrendingItem["format"],
        };
      })
      .filter((item): item is TrendingItem => item !== null);
  } catch (err) {
    console.error("[trending] AI ranking failed:", err instanceof Error ? err.message : err);
    // Fallback: return top 5 by virality score
    return items
      .sort((a, b) => b.viralityScore - a.viralityScore)
      .slice(0, 5);
  }
}
