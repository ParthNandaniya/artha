import { generateAgentJSON } from "@/lib/ai/agent-model-router";

const TWEET_MAX = 280;
const SIGNATURE = "\n\n— agents @tryarthaHQ";

function clampTweet(text: string): string {
  if (text.length <= TWEET_MAX) return text;
  // Don't cut in the middle of a URL — find the last space before the limit
  let cutPoint = TWEET_MAX - 3;
  // If we're cutting inside a URL (no space after last https://), back up to before the URL
  const lastUrlStart = text.lastIndexOf("https://", cutPoint);
  if (lastUrlStart > 0) {
    const spaceAfterUrl = text.indexOf(" ", lastUrlStart);
    if (spaceAfterUrl === -1 || spaceAfterUrl > cutPoint) {
      // We'd cut inside a URL — cut before the URL instead
      cutPoint = lastUrlStart > 1 ? lastUrlStart - 1 : cutPoint;
    }
  }
  return text.slice(0, cutPoint).trimEnd() + "...";
}

/**
 * Appends the agent signature to a tweet if it fits within the limit.
 * If it doesn't fit, tries a shorter version. If that doesn't fit either, returns as-is.
 */
function appendSignature(text: string): string {
  if (text.length + SIGNATURE.length <= TWEET_MAX) {
    return text + SIGNATURE;
  }
  const short = "\n\n— @tryarthaHQ AI agents";
  if (text.length + short.length <= TWEET_MAX) {
    return text + short;
  }
  return text;
}

// ── Showcase tweet (company highlight with screenshot) ──────────────

export interface ShowcaseProject {
  name: string;
  slug: string;
  tagline: string;
  oneLiner?: string;
  visitors?: number;
}

export async function generateShowcaseTweet(
  project: ShowcaseProject
): Promise<{ tweet: string }> {
  const siteUrl = `https://${project.slug}.tryartha.com`;
  const stats = project.visitors ? `(${project.visitors} visitors this week)` : "";

  const result = await generateAgentJSON<{ tweet: string }>(
    "twitter_growth",
    `You write showcase tweets for @tryarthaHQ — an AI platform that builds companies from a single prompt.

Rules — follow every one:
- This tweet will have a screenshot of the live site attached, so DON'T describe the visual — focus on what the company does and why it's interesting
- Include the live site URL: ${siteUrl}
- Tag @tryarthaHQ naturally (e.g. "Built with @tryarthaHQ" at the end, or woven into the text)
- Must be ≤240 characters (hard limit — we append a signature after)
- Tone: like a founder sharing something cool they found, not a press release
- Open with what makes this company interesting — the problem, the audience, or a surprising angle
- No hashtags, no emojis
- Do NOT start with "Introducing", "Meet", "Check out", or "Excited to share"
- Do NOT use generic phrases like "revolutionizing", "game-changing", "the future of"
- Do NOT include any signature or attribution line — that's added automatically

Return JSON: { tweet: string }`,
    `Company: ${project.name}
Tagline: ${project.tagline}
${project.oneLiner ? `Description: ${project.oneLiner}` : ""}
Site: ${siteUrl}
${stats}`
  );

  return { tweet: clampTweet(appendSignature(result.tweet)) };
}

// ── Short link helper ────────────────────────────────────────────────

/**
 * Builds a short redirect URL via artha.run/s/SLUG.
 * Saves ~30-50 chars vs full TrustMRR/IH URLs in tweets.
 */
function buildShortLink(sourceUrl: string, source: string): string {
  if (source === "trustmrr") {
    const slug = sourceUrl.split("/startup/")[1];
    if (slug) return `https://artha.run/s/trustmrr-${slug}`;
  } else if (source === "indiehackers") {
    const slug = sourceUrl.split("/product/")[1];
    if (slug) return `https://artha.run/s/ih-${slug}`;
  }
  return sourceUrl; // fallback to full URL
}

// ── Founder story (hook tweet + reply thread with breakdown) ─────────

export interface FounderStoryInput {
  name: string;
  mrr: string;
  growth?: string;
  founder?: string;
  description: string;
  productUrl?: string;
  sourceUrl: string;
  source: string;
}

export async function generateFounderStoryThread(
  input: FounderStoryInput,
  recentTopics: string[]
): Promise<{ hookTweet: string; replyTweet: string; headline: string }> {
  const avoid = recentTopics.length > 0
    ? `\nAvoid these founders (already posted): ${recentTopics.join(", ")}`
    : "";

  const productLink = input.productUrl || buildShortLink(input.sourceUrl, input.source);
  const sourceName = input.source === "trustmrr" ? "TrustMRR" : "Indie Hackers";

  // Calculate exact character budgets:
  // - Hook tweet: pure text, no URL, no signature → 260 chars
  // - Reply tweet: text + URL + suffix + signature must fit in 280
  //   The URL and suffix are mandatory, so we subtract their length
  const replySuffix = `\n\nRevenue verified on ${sourceName}.`;
  const replyUrlText = `\n${productLink}`;
  const replyFixedChars = replyUrlText.length + replySuffix.length + SIGNATURE.length;
  const replyTextBudget = TWEET_MAX - replyFixedChars;

  const result = await generateAgentJSON<{
    hook_tweet: string;
    reply_tweet: string;
    headline: string;
  }>(
    "twitter_growth",
    `You write viral "founder story" tweet threads for @tryarthaHQ. Real verified revenue numbers from indie founders.

You're writing TWO tweets: a scroll-stopping HOOK tweet, and a REPLY tweet with the full breakdown.

═══ HOOK TWEET (the main tweet — this is what people see first) ═══
- MUST open with the dollar amount in a jaw-dropping way
- Use patterns that go viral on Twitter:
  • "This solo founder is making $X/mo with a [simple description]."
  • "$X/mo. One founder. One product. Zero VC money."
  • "A [tool type] is making $X/mo. Most people don't even know this niche exists."
  • "This founder quietly built a $X/mo business while everyone was chasing AI hype."
- Make people NEED to click "Show more" / see the reply
- Keep it punchy, create curiosity gap
- ≤ 260 characters STRICT (this is the entire tweet, nothing is appended)
- No hashtags, no emojis, no questions
- Do NOT tag @tryarthaHQ in the hook
- ONLY use the data provided below — do NOT make up or embellish facts

═══ REPLY TWEET (threaded reply — the breakdown) ═══
- IMPORTANT: You have ONLY ${replyTextBudget} characters for this text. The URL, source credit, and signature are appended AUTOMATICALLY — do NOT include them yourself.
- Start with what the product actually does in plain language
- Include the founder's name if available
- Add context that makes founders jealous or inspired
- Do NOT include any URL — it is appended automatically
- Do NOT include "Revenue verified on..." — it is appended automatically
- Do NOT include @tryarthaHQ or any signature — it is appended automatically
- ≤ ${replyTextBudget} characters STRICT (URL + source + signature are added after your text)

═══ HEADLINE (for the card image) ═══
- The key metric as a short punchy line for the branded card
- Examples: "$77k/mo SEO bot", "Solo founder → $85k/mo", "$206k/mo analytics"
- Keep under 25 characters

Data about this founder:
- Product: ${input.name}
- MRR: ${input.mrr}/mo (verified on ${sourceName})
${input.growth ? `- MoM Growth: ${input.growth}` : ""}
${input.founder ? `- Founder: ${input.founder}` : ""}
- Description: ${input.description || "N/A"}
- Product URL: ${productLink}
${avoid}

Return JSON: { hook_tweet: string, reply_tweet: string, headline: string }`,
    `Write a viral founder story thread about ${input.name} making ${input.mrr}/mo. Make it impossible to scroll past.`
  );

  // Assemble the reply: text + URL + source credit + signature
  // All parts have pre-calculated space, so it should fit in 280
  const assembledReply = `${result.reply_tweet.trim()}${replyUrlText}${replySuffix}`;

  return {
    hookTweet: clampTweet(result.hook_tweet),
    replyTweet: clampTweet(appendSignature(assembledReply)),
    headline: result.headline,
  };
}

// ── Tip / insight tweet ─────────────────────────────────────────────

export async function generateTipTweet(
  recentTopics: string[]
): Promise<{ tweet: string; topic: string }> {
  const avoid = recentTopics.length > 0
    ? `\nAvoid these topics (already posted recently): ${recentTopics.join(", ")}`
    : "";

  const result = await generateAgentJSON<{ tweet: string; topic: string }>(
    "twitter_growth",
    `You write short, punchy SaaS/startup tips for @tryarthaHQ's Twitter account.

Niche: AI-powered company building, SaaS growth, solo founder tactics, validating ideas fast.

Rules:
- One specific, actionable tip per tweet — not a vague platitude
- Must be ≤240 characters (hard limit — we append a signature after)
- MUST open with a concrete number, metric, or stat — e.g. "73% of startups that...", "$0 to $10k MRR in 60 days...", "4 out of 5 solo founders..."
- If no real stat exists, use a specific quantified claim from founder experience — e.g. "I cut churn by 40% by...", "3 things that 10x'd our signups..."
- Tone: experienced founder sharing a hard-won lesson at midnight, not a LinkedIn influencer
- Do NOT tag @tryarthaHQ — that's added automatically in the signature
- No hashtags, no emojis
- Do NOT start with "Tip:", "Pro tip:", or "Here's a tip"
- Be specific: mention real tactics, numbers, or tools — not "focus on your customers"
- Do NOT include any signature or attribution line — that's added automatically
${avoid}

Return JSON: { tweet: string, topic: string (2-3 word topic label) }`,
    "Write a tweet with a specific number or metric that makes founders stop scrolling. Think: '72% of...', '$0 to $X in Y days...', '3 things that 10x'd...'. Data-driven hooks get saved and shared."
  );

  return { tweet: clampTweet(appendSignature(result.tweet)), topic: result.topic };
}

// ── Thread (4-6 tweets, deep dive) ──────────────────────────────────

export async function generateThread(
  recentTopics: string[]
): Promise<{ tweets: string[]; topic: string; summary: string }> {
  const avoid = recentTopics.length > 0
    ? `\nAvoid these topics (already posted recently): ${recentTopics.join(", ")}`
    : "";

  const result = await generateAgentJSON<{
    tweets: string[];
    topic: string;
    summary: string;
  }>(
    "twitter_growth",
    `You write tweet threads for @tryarthaHQ about AI company building, SaaS growth, and the future of starting businesses with AI.

Thread rules:
- 4-6 tweets (not fewer)
- Tweet 1 (hook): MUST lead with a specific number, metric, or data point — e.g. "We tracked 200 AI-built startups for 6 months. Here's what separated the winners:", "$0 to $14k MRR in 4 months — not by shipping faster, but by..."
- Tweets 2-4 (substance): include at least 2 concrete numbers/percentages/timeframes across these tweets — e.g. "40% reduction in churn", "3x faster onboarding", "went from 12 hours/week to 2"
- Tweet 5 (pivot): counterintuitive takeaway backed by a specific comparison or result
- Last tweet (CTA): invite engagement, link to https://artha.run, tag @tryarthaHQ
- Each tweet ≤240 characters (hard limit — last tweet gets a signature appended)
- Tone: authentic founder, specific, human — not a corporate content team
- No emojis except MAYBE one on the last tweet
- Max 1 hashtag, only on the very last tweet (zero is fine)
- Number tweets like "1/" "2/" etc.
- Do NOT include any signature or attribution line — that's added automatically to the last tweet
${avoid}

Return JSON: { tweets: string[], topic: string (2-3 word label), summary: string (one sentence) }`,
    "Write a thread that opens with a compelling metric or data point. Every tweet should feel like it contains something concrete — numbers, percentages, timeframes, dollar amounts. Founders save threads with real data, not opinions."
  );

  const tweets = result.tweets.map(clampTweet);
  if (tweets.length > 0) {
    tweets[tweets.length - 1] = clampTweet(appendSignature(tweets[tweets.length - 1]));
  }
  return { tweets, topic: result.topic, summary: result.summary };
}

// ── Trending / hot take tweet ──────────────────────────────────────

export interface TrendingInput {
  headline: string;
  summary: string;
  sourceUrl: string;
  sourceType: "news" | "tweet";
  format: "hot_take" | "news_react" | "qrt" | "insight";
  tweetContext?: {
    authorUsername: string;
    tweetId: string;
    engagement: number;
  };
}

export async function generateTrendingTweet(
  item: TrendingInput,
  recentTopics: string[]
): Promise<{ tweet: string; topic: string }> {
  const avoid = recentTopics.length > 0
    ? `\nAvoid these topics (already posted recently): ${recentTopics.join(", ")}`
    : "";

  const formatGuide = {
    hot_take: "Bold, opinionated one-liner that triggers agreement OR disagreement. Controversy = engagement. Under 200 chars ideal.",
    news_react: "BREAKING/JUST IN delivery — be the one who broke the news. State the fact, then add one killer take.",
    qrt: `React to @${item.tweetContext?.authorUsername || "the author"}'s tweet with a take so good people RT you instead of the original.`,
    insight: "Connect this news to what it REALLY means — the angle nobody else is saying. Make people feel smart for sharing.",
  };

  const result = await generateAgentJSON<{ options: Array<{ tweet: string; strength: string }>; best: number; topic: string }>(
    "twitter_growth",
    `You run a viral breaking news account. Your tweets get millions of views because you deliver news FIRST and make people FEEL something.

FORMAT: ${item.format} — ${formatGuide[item.format]}

═══ ATTENTION PREFIXES (use these to stop the scroll) ═══
- "BREAKING:" — major news, war updates, market crashes, big announcements
- "JUST IN:" — fresh news that just dropped
- "HUGE:" — surprising developments that make people say "wait what"
- "CONFIRMED:" — rumors now confirmed
- "UPDATE:" — developing stories (war updates, ongoing situations)
- "REPORT:" — data, studies, shocking stats
- "MARKETS:" — stock moves, crashes, rallies, oil prices
- No prefix — for raw hot takes where the opinion IS the hook

For news_react and qrt → ALWAYS use a prefix. For hot_take → use one only if it amplifies the punch.

═══ CONTENT TYPES & HOW TO WRITE THEM ═══

WAR / GEOPOLITICS:
- State the development factually, then add ONE line on what it means for tech/markets/founders
- Use exact details: "Day 38", specific countries, specific weapons, specific companies affected
- Example patterns:
  "BREAKING: Iran rejects ceasefire. Oil just hit $X. Defense tech stocks are about to go parabolic."
  "UPDATE: IRGC threatens 18 US tech companies. If you have servers in the Middle East, move them NOW."
  "The Iran war just made Palantir and Anduril the two most important companies in America."

STOCKS / MARKETS:
- ALWAYS include the ticker ($NVDA, $TSLA) and the exact % move
- Add context on WHY it moved — connect to bigger story
- Example patterns:
  "BREAKING: $TSLA down 8% after hours. Elon was too busy tweeting about X to notice deliveries collapsed."
  "$NVDA just crossed $X. Jensen Huang is now worth more than most countries."
  "MARKETS: S&P 500 down 3% in one hour. This is what happens when oil hits $120."
  "Energy stocks up 39% this quarter. AI stocks down 15%. The market is telling you something."

CELEBRITY TECH:
- Name-drop immediately, quote or paraphrase what they said
- Add your reaction as if you're a founder who just read it
- Example patterns:
  "Elon just posted [X]. This man is running 6 companies and still has time to shitpost at 2am."
  "Sam Altman just said [X]. Every AI startup founder needs to read this twice."

═══ PSYCHOLOGY TRIGGERS (use at least 2 per tweet) ═══
These are what make people click, like, RT:
1. CURIOSITY GAP — hint at something without fully revealing it ("...and it's not what you think")
2. OUTRAGE/SURPRISE — challenge what people believe ("Everyone's celebrating X. They're wrong.")
3. FOMO — make them feel behind if they don't engage ("If you're not watching X right now...")
4. SOCIAL PROOF — big numbers, celebrity names, authority ("Elon just said...", "$2B in 24 hours")
5. TRIBALISM — pick a side, make people want to agree/disagree publicly
6. URGENCY — this is happening NOW, not yesterday
7. SPECIFICITY — exact numbers > vague claims ("$4.2B" not "billions", "47%" not "almost half")
8. FEAR — "if you're not paying attention to X, you're going to get burned"
9. CONTRARIAN — take the opposite side of what everyone's saying

═══ FACT-CHECK RULES (CRITICAL — violating these gets us cancelled) ═══
- ONLY state facts that are directly supported by the headline and summary provided below
- NEVER fabricate quotes, claims, or labels about real people (e.g. don't call someone a "sociopath" unless the source literally says that AND attributes it to a named person)
- NEVER exaggerate or twist what the source says — if the source says "insiders question leadership" don't turn it into "insiders call him a fraud"
- If the source is vague, keep the tweet vague too — don't fill gaps with speculation presented as fact
- Opinions are fine ("this changes everything", "bullish on this") but label them as YOUR take, not as news
- For stock/market claims, only use numbers from the source — don't guess percentages
- A source reply with the link is posted automatically after your tweet — readers WILL check
- Getting caught posting fake news destroys the account. Engagement means nothing if we lose trust.

Rules:
- Generate 3 caption options (A/B testing)
- Each option ≤240 characters (hard limit — we append a signature after)
- Tone: the insider who always knows first. Not a news bot — a person with an opinion.
- Every tweet must make the reader feel: shocked, outraged, excited, or afraid of missing out
- Reference specific names, numbers, tickers, companies — vague = boring = scroll past
- Include $ tickers for any stock mentioned ($TSLA not Tesla, $NVDA not NVIDIA)
- Include exact percentages for any market move — ONLY if the source provides them
- No hashtags, no emojis
- Do NOT tag @tryarthaHQ — that's added automatically
- Do NOT include any signature or attribution line
- Do NOT include URLs — those are added automatically as a reply
- Name-drop celebrities/CEOs when relevant (Elon, Sam Altman, Jensen, Zuck, etc.)
- Separate FACT from OPINION clearly — state what happened, then add your take
${avoid}

Pick the strongest option based on: will people FEEL something when they read this? The one that triggers the strongest emotional response wins — BUT every fact must be backed by the source.

Trending item:
- Headline: ${item.headline}
- Summary: ${item.summary.slice(0, 400)}
- Source: ${item.sourceType === "tweet" ? `Tweet by @${item.tweetContext?.authorUsername}` : "News article"}
${item.tweetContext ? `- Engagement: ${item.tweetContext.engagement.toLocaleString()} weighted interactions` : ""}

Return JSON: { options: [{ tweet: string, strength: string }], best: number (0-indexed), topic: string (2-3 word label) }`,
    `React to: "${item.headline}". Write 3 options using psychology triggers. The winning tweet should make someone STOP scrolling and hit like/RT before they even think about it.`
  );

  const bestIdx = Math.min(result.best, result.options.length - 1);
  const bestTweet = result.options[bestIdx]?.tweet || result.options[0]?.tweet;

  return {
    tweet: clampTweet(appendSignature(bestTweet)),
    topic: result.topic,
  };
}

// ── Article / long-form (posted as mega-thread for now) ─────────────

export async function generateArticle(
  recentTopics: string[]
): Promise<{ tweets: string[]; topic: string; title: string }> {
  const avoid = recentTopics.length > 0
    ? `\nAvoid these topics: ${recentTopics.join(", ")}`
    : "";

  const result = await generateAgentJSON<{
    tweets: string[];
    topic: string;
    title: string;
  }>(
    "twitter_growth",
    `You write long-form educational threads for @tryarthaHQ — mini blog posts delivered as 8-12 tweet threads.

Topic space: AI company building, SaaS playbooks, validating ideas, growth tactics, solo founder frameworks.

Rules:
- 8-12 tweets (this is a deep-dive, not a quick thread)
- Tweet 1 (hook): MUST open with a compelling number or metric — e.g. "We analyzed 500 SaaS launches. Only 12% survived year one. The difference came down to 3 things:", "87% of founders spend 60%+ of their time on tasks AI can do in seconds."
- Tweets 2-10: structured like a blog post — include specific numbers, percentages, dollar amounts, or timeframes in at least half the tweets. Concrete > abstract.
- Second-to-last tweet: key takeaway or summary
- Last tweet: CTA to https://artha.run + tag @tryarthaHQ + ask a question to drive replies
- Each tweet ≤240 characters (hard limit — last tweet gets a signature appended)
- Number tweets "1/" "2/" etc.
- Tone: knowledgeable but approachable — like a smart friend explaining something over coffee
- No emojis except possibly last tweet
- Do NOT include any signature or attribution line — that's added automatically to the last tweet
${avoid}

Return JSON: { tweets: string[], topic: string (2-3 words), title: string (article title) }`,
    "Write an educational long-form thread packed with specific numbers and metrics. Open with a data-driven hook. Each tweet should include at least one concrete number, percentage, dollar figure, or timeframe. Data-rich threads get bookmarked and shared."
  );

  const tweets = result.tweets.map(clampTweet);
  if (tweets.length > 0) {
    tweets[tweets.length - 1] = clampTweet(appendSignature(tweets[tweets.length - 1]));
  }
  return { tweets, topic: result.topic, title: result.title };
}
