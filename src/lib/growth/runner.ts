import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { postTweet, postTweetWithMedia, postTweetWithVideo, postThread, replyToTweet, isTwitterPlatformAccountConfigured } from "@/lib/twitter";
import type { PostedTweet } from "@/lib/twitter";
import { postToBluesky, postToBlueskyWithMedia, postToBlueskyWithVideo, postThreadToBluesky, isBlueskyConfigured } from "./bluesky";
import type { BlueskyPost } from "./bluesky";
import { postToLinkedInPlatform, postToLinkedInPlatformWithMedia, postToLinkedInPlatformWithVideo, isLinkedInPlatformConfigured } from "./linkedin";
import { screenshotSite } from "@/lib/screenshot";
import {
  generateShowcaseTweet,
  generateTipTweet,
  generateThread,
  generateArticle,
  generateFounderStoryThread,
  generateTrendingTweet,
} from "./content-generator";
import { generateTipCard, generateThreadCard, generateFounderStoryCard } from "./card-generator";
import { discoverTrending } from "./trending";
import { scrapeFounderStories, enrichStoryFromTrustMRR } from "./story-scraper";
import {
  getNextContentSlot,
  getRecentTopics,
  getShowcaseableProjects,
  recordPost,
  type ContentSlot,
} from "./scheduler";
import { runShortsPipeline } from "@/lib/shorts-pipeline/runner";

/** Save a card buffer to a temp file and log the path so you can preview it. */
function saveDryRunCard(card: Buffer, label: string): string {
  const filename = `artha-${label}-${Date.now()}.png`;
  const filepath = join(tmpdir(), filename);
  writeFileSync(filepath, card);
  return filepath;
}

export interface BotResult {
  category: ContentSlot;
  tweetUrls: string[];
  blueskyUrls: string[];
  linkedinUrls: string[];
  content: string;
  topic?: string;
  projectSlug?: string;
}

export interface BotRunResult {
  posted: BotResult[];
  skipped: string[];
  errors: string[];
}

type Platform = "twitter" | "bluesky" | "linkedin";

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[growth-bot ${ts}] ${msg}`);
}

/** Adapt text for Bluesky — swap Twitter handle for Bluesky handle */
function adaptForBluesky(text: string): string {
  return text.replace(/@tryarthaHQ/g, "@artha.run");
}

function getActivePlatforms(): Platform[] {
  const platforms: Platform[] = [];
  if (isTwitterPlatformAccountConfigured()) platforms.push("twitter");
  if (isBlueskyConfigured()) platforms.push("bluesky");
  if (isLinkedInPlatformConfigured()) platforms.push("linkedin");
  return platforms;
}

// ── Platform posting helpers ─────────────────────────────────────────

interface PostAllResult {
  tweetUrls: string[];
  blueskyUrls: string[];
  blueskyUris: string[]; // at:// URIs for API calls (reply engine)
  linkedinUrls: string[];
}

async function postTextToAll(
  text: string,
  platforms: Platform[],
  dryRun: boolean
): Promise<PostAllResult> {
  const tweetUrls: string[] = [];
  const blueskyUrls: string[] = [];
  const blueskyUris: string[] = [];
  const linkedinUrls: string[] = [];

  if (dryRun) return { tweetUrls, blueskyUrls, blueskyUris, linkedinUrls };

  const tasks: Promise<void>[] = [];

  if (platforms.includes("twitter")) {
    tasks.push(
      postTweet({ text })
        .then((p) => { tweetUrls.push(p.tweetUrl); })
        .catch((err) => { log(`Twitter post failed: ${err instanceof Error ? err.message : String(err)}`); })
    );
  }

  if (platforms.includes("bluesky")) {
    tasks.push(
      postToBluesky({ text: adaptForBluesky(text) })
        .then((p) => { blueskyUrls.push(p.postUrl); blueskyUris.push(p.uri); })
        .catch((err) => { log(`Bluesky post failed: ${err instanceof Error ? err.message : String(err)}`); })
    );
  }

  if (platforms.includes("linkedin")) {
    tasks.push(
      postToLinkedInPlatform({ text })
        .then((p) => { linkedinUrls.push(p.postUrl); })
        .catch((err) => { log(`LinkedIn post failed: ${err instanceof Error ? err.message : String(err)}`); })
    );
  }

  await Promise.all(tasks);
  return { tweetUrls, blueskyUrls, blueskyUris, linkedinUrls };
}

async function postWithMediaToAll(
  text: string,
  media: Buffer,
  platforms: Platform[],
  dryRun: boolean
): Promise<PostAllResult> {
  const tweetUrls: string[] = [];
  const blueskyUrls: string[] = [];
  const blueskyUris: string[] = [];
  const linkedinUrls: string[] = [];

  if (dryRun) return { tweetUrls, blueskyUrls, blueskyUris, linkedinUrls };

  const tasks: Promise<void>[] = [];

  if (platforms.includes("twitter")) {
    tasks.push(
      postTweetWithMedia({ text, media })
        .then((p) => { tweetUrls.push(p.tweetUrl); })
        .catch((mediaErr) => {
          log(`Twitter media upload failed: ${mediaErr instanceof Error ? mediaErr.message : String(mediaErr)} — trying text-only`);
          return postTweet({ text })
            .then((p) => { tweetUrls.push(p.tweetUrl); })
            .catch((err) => { log(`Twitter text-only fallback failed: ${err instanceof Error ? err.message : String(err)}`); });
        })
    );
  }

  if (platforms.includes("bluesky")) {
    const bskyText = adaptForBluesky(text);
    tasks.push(
      postToBlueskyWithMedia({ text: bskyText, media })
        .then((p) => { blueskyUrls.push(p.postUrl); blueskyUris.push(p.uri); })
        .catch((mediaErr) => {
          log(`Bluesky media upload failed: ${mediaErr instanceof Error ? mediaErr.message : String(mediaErr)} — trying text-only`);
          return postToBluesky({ text: bskyText })
            .then((p) => { blueskyUrls.push(p.postUrl); blueskyUris.push(p.uri); })
            .catch((err) => { log(`Bluesky text-only fallback failed: ${err instanceof Error ? err.message : String(err)}`); });
        })
    );
  }

  if (platforms.includes("linkedin")) {
    tasks.push(
      postToLinkedInPlatformWithMedia({ text, media })
        .then((p) => { linkedinUrls.push(p.postUrl); })
        .catch((mediaErr) => {
          log(`LinkedIn media upload failed: ${mediaErr instanceof Error ? mediaErr.message : String(mediaErr)} — trying text-only`);
          return postToLinkedInPlatform({ text })
            .then((p) => { linkedinUrls.push(p.postUrl); })
            .catch((err) => { log(`LinkedIn text-only fallback failed: ${err instanceof Error ? err.message : String(err)}`); });
        })
    );
  }

  await Promise.all(tasks);
  return { tweetUrls, blueskyUrls, blueskyUris, linkedinUrls };
}

async function postWithVideoToAll(
  text: string,
  videoBuffer: Buffer,
  platforms: Platform[],
  dryRun: boolean
): Promise<PostAllResult> {
  const tweetUrls: string[] = [];
  const blueskyUrls: string[] = [];
  const blueskyUris: string[] = [];
  const linkedinUrls: string[] = [];

  if (dryRun) return { tweetUrls, blueskyUrls, blueskyUris, linkedinUrls };

  const tasks: Promise<void>[] = [];

  if (platforms.includes("twitter")) {
    tasks.push(
      postTweetWithVideo({ text, videoBuffer })
        .then((p) => { tweetUrls.push(p.tweetUrl); })
        .catch((videoErr) => {
          log(`Twitter video upload failed: ${videoErr instanceof Error ? videoErr.message : String(videoErr)} — trying text-only`);
          return postTweet({ text })
            .then((p) => { tweetUrls.push(p.tweetUrl); })
            .catch((err) => { log(`Twitter text-only fallback failed: ${err instanceof Error ? err.message : String(err)}`); });
        })
    );
  }

  if (platforms.includes("bluesky")) {
    const bskyText = adaptForBluesky(text);
    tasks.push(
      postToBlueskyWithVideo({ text: bskyText, videoBuffer })
        .then((p) => { blueskyUrls.push(p.postUrl); blueskyUris.push(p.uri); })
        .catch((videoErr) => {
          log(`Bluesky video upload failed: ${videoErr instanceof Error ? videoErr.message : String(videoErr)} — trying text-only`);
          return postToBluesky({ text: bskyText })
            .then((p) => { blueskyUrls.push(p.postUrl); blueskyUris.push(p.uri); })
            .catch((err) => { log(`Bluesky text-only fallback failed: ${err instanceof Error ? err.message : String(err)}`); });
        })
    );
  }

  if (platforms.includes("linkedin")) {
    tasks.push(
      postToLinkedInPlatformWithVideo({ text, videoBuffer })
        .then((p) => { linkedinUrls.push(p.postUrl); })
        .catch((videoErr) => {
          log(`LinkedIn video upload failed: ${videoErr instanceof Error ? videoErr.message : String(videoErr)} — trying text-only`);
          return postToLinkedInPlatform({ text })
            .then((p) => { linkedinUrls.push(p.postUrl); })
            .catch((err) => { log(`LinkedIn text-only fallback failed: ${err instanceof Error ? err.message : String(err)}`); });
        })
    );
  }

  await Promise.all(tasks);
  return { tweetUrls, blueskyUrls, blueskyUris, linkedinUrls };
}

async function postThreadToAll(
  tweets: string[],
  platforms: Platform[],
  dryRun: boolean,
  firstTweetMedia?: Buffer
): Promise<PostAllResult> {
  const tweetUrls: string[] = [];
  const blueskyUrls: string[] = [];
  const blueskyUris: string[] = [];
  const linkedinUrls: string[] = [];

  if (dryRun) return { tweetUrls, blueskyUrls, blueskyUris, linkedinUrls };

  // Build tweet payloads — attach media to the first tweet if provided
  const tweetPayloads = tweets.map((text, i) => ({
    text,
    media: i === 0 ? firstTweetMedia : undefined,
  }));

  const tasks: Promise<void>[] = [];

  if (platforms.includes("twitter")) {
    tasks.push(
      postThread(tweetPayloads)
        .then((posted) => { tweetUrls.push(...posted.map((p) => p.tweetUrl)); })
        .catch((err) => { log(`Twitter thread failed: ${err instanceof Error ? err.message : String(err)}`); })
    );
  }

  if (platforms.includes("bluesky")) {
    const bskyPayloads = tweetPayloads.map((p) => ({ ...p, text: adaptForBluesky(p.text) }));
    tasks.push(
      postThreadToBluesky(bskyPayloads)
        .then((posted) => {
          blueskyUrls.push(...posted.map((p) => p.postUrl));
          blueskyUris.push(...posted.map((p) => p.uri));
        })
        .catch((err) => { log(`Bluesky thread failed: ${err instanceof Error ? err.message : String(err)}`); })
    );
  }

  // LinkedIn doesn't have native threading — combine into a single long post
  if (platforms.includes("linkedin")) {
    const combinedText = tweets.join("\n\n").slice(0, 3000);
    const postFn = firstTweetMedia
      ? () => postToLinkedInPlatformWithMedia({ text: combinedText, media: firstTweetMedia })
      : () => postToLinkedInPlatform({ text: combinedText });

    tasks.push(
      postFn()
        .then((p) => { linkedinUrls.push(p.postUrl); })
        .catch((err) => {
          log(`LinkedIn thread post failed: ${err instanceof Error ? err.message : String(err)}`);
          // If media failed, try text-only
          if (firstTweetMedia) {
            return postToLinkedInPlatform({ text: combinedText })
              .then((p) => { linkedinUrls.push(p.postUrl); })
              .catch((err2) => { log(`LinkedIn text-only fallback failed: ${err2 instanceof Error ? err2.message : String(err2)}`); });
          }
        })
    );
  }

  await Promise.all(tasks);
  return { tweetUrls, blueskyUrls, blueskyUris, linkedinUrls };
}

// ── Post a showcase with screenshot ──────────────────────────────────

async function postShowcase(dryRun: boolean, platforms: Platform[]): Promise<BotResult | null> {
  const projects = await getShowcaseableProjects();
  if (projects.length === 0) {
    log("No showcaseable projects found — skipping showcase");
    return null;
  }

  const project = projects[0];
  log(`Showcase: ${project.name} (${project.slug})`);

  const { tweet } = await generateShowcaseTweet({
    name: project.name,
    slug: project.slug,
    tagline: project.tagline,
    oneLiner: project.oneLiner || undefined,
    visitors: project.visitors || undefined,
  });

  log(`Generated: "${tweet.slice(0, 80)}..."`);

  if (dryRun) {
    log("[DRY RUN] Would post showcase with screenshot");
    await recordPost({
      category: "showcase",
      tweetIds: [],
      tweetUrls: [],
      content: tweet,
      projectId: project.id,
      status: "draft",
      topic: project.name,
    });
    return { category: "showcase", tweetUrls: [], blueskyUrls: [], linkedinUrls: [], content: tweet, topic: project.name, projectSlug: project.slug };
  }

  // Take screenshot
  let screenshot: Buffer | undefined;
  try {
    const url = `https://${project.slug}.tryartha.com`;
    log(`Screenshotting ${url}...`);
    screenshot = await screenshotSite(url);
    log(`Screenshot captured (${Math.round(screenshot.length / 1024)}KB)`);
  } catch (err) {
    log(`Screenshot failed: ${err instanceof Error ? err.message : String(err)} — posting without image`);
  }

  const { tweetUrls, blueskyUrls, blueskyUris, linkedinUrls } = screenshot
    ? await postWithMediaToAll(tweet, screenshot, platforms, false)
    : await postTextToAll(tweet, platforms, false);

  const allUrls = [...tweetUrls, ...blueskyUrls, ...linkedinUrls];
  const metadata: Record<string, unknown> = {};
  if (blueskyUris.length > 0) metadata.bluesky_uris = blueskyUris;
  if (linkedinUrls.length > 0) metadata.linkedin_urls = linkedinUrls;
  await recordPost({
    category: "showcase",
    tweetIds: tweetUrls.map((u) => u.split("/").pop() || ""),
    tweetUrls: allUrls,
    content: tweet,
    projectId: project.id,
    status: allUrls.length > 0 ? "posted" : "failed",
    topic: project.name,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  });

  for (const url of allUrls) log(`Posted: ${url}`);
  return { category: "showcase", tweetUrls, blueskyUrls, linkedinUrls, content: tweet, topic: project.name, projectSlug: project.slug };
}

// ── Post a tip tweet ────────────────────────────────────────────────

async function postTip(dryRun: boolean, platforms: Platform[]): Promise<BotResult | null> {
  const recentTopics = await getRecentTopics("tip");
  const { tweet, topic } = await generateTipTweet(recentTopics);

  log(`Generated tip [${topic}]: "${tweet.slice(0, 80)}..."`);

  // Generate branded card image
  let card: Buffer | undefined;
  try {
    card = await generateTipCard(tweet);
    log(`Tip card generated (${Math.round(card.length / 1024)}KB)`);
  } catch (err) {
    log(`Tip card generation failed: ${err instanceof Error ? err.message : String(err)} — posting text-only`);
  }

  if (dryRun) {
    if (card) {
      const path = saveDryRunCard(card, "tip");
      log(`[DRY RUN] Card saved → ${path}`);
    }
    log("[DRY RUN] Would post tip" + (card ? " with card" : ""));
    await recordPost({ category: "tip", tweetIds: [], tweetUrls: [], content: tweet, status: "draft", topic });
    return { category: "tip", tweetUrls: [], blueskyUrls: [], linkedinUrls: [], content: tweet, topic };
  }

  const { tweetUrls, blueskyUrls, blueskyUris, linkedinUrls } = card
    ? await postWithMediaToAll(tweet, card, platforms, false)
    : await postTextToAll(tweet, platforms, false);

  const allUrls = [...tweetUrls, ...blueskyUrls, ...linkedinUrls];
  const metadata: Record<string, unknown> = {};
  if (blueskyUris.length > 0) metadata.bluesky_uris = blueskyUris;
  if (linkedinUrls.length > 0) metadata.linkedin_urls = linkedinUrls;
  await recordPost({
    category: "tip",
    tweetIds: tweetUrls.map((u) => u.split("/").pop() || ""),
    tweetUrls: allUrls,
    content: tweet,
    status: allUrls.length > 0 ? "posted" : "failed",
    topic,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  });

  for (const url of allUrls) log(`Posted: ${url}`);
  return { category: "tip", tweetUrls, blueskyUrls, linkedinUrls, content: tweet, topic };
}

// ── Post a thread ───────────────────────────────────────────────────

async function postThreadContent(dryRun: boolean, platforms: Platform[]): Promise<BotResult | null> {
  const recentTopics = await getRecentTopics("thread");
  const { tweets, topic, summary } = await generateThread(recentTopics);

  log(`Generated thread [${topic}]: ${tweets.length} tweets — ${summary}`);

  // Generate branded header card for the first tweet
  let headerCard: Buffer | undefined;
  try {
    headerCard = await generateThreadCard(summary || topic, "thread");
    log(`Thread header card generated (${Math.round(headerCard.length / 1024)}KB)`);
  } catch (err) {
    log(`Thread card generation failed: ${err instanceof Error ? err.message : String(err)} — posting text-only`);
  }

  if (dryRun) {
    if (headerCard) {
      const path = saveDryRunCard(headerCard, "thread");
      log(`[DRY RUN] Card saved → ${path}`);
    }
    log("[DRY RUN] Would post thread" + (headerCard ? " with header card" : ""));
    await recordPost({
      category: "thread",
      tweetIds: [],
      tweetUrls: [],
      content: JSON.stringify(tweets),
      status: "draft",
      topic,
    });
    return { category: "thread", tweetUrls: [], blueskyUrls: [], linkedinUrls: [], content: tweets.join("\n---\n"), topic };
  }

  const { tweetUrls, blueskyUrls, blueskyUris, linkedinUrls } = await postThreadToAll(tweets, platforms, false, headerCard);

  const allUrls = [...tweetUrls, ...blueskyUrls, ...linkedinUrls];
  const metadata: Record<string, unknown> = {};
  if (blueskyUris.length > 0) metadata.bluesky_uris = blueskyUris;
  if (linkedinUrls.length > 0) metadata.linkedin_urls = linkedinUrls;
  await recordPost({
    category: "thread",
    tweetIds: tweetUrls.map((u) => u.split("/").pop() || ""),
    tweetUrls: allUrls,
    content: JSON.stringify(tweets),
    status: allUrls.length > 0 ? "posted" : "failed",
    topic,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  });

  if (allUrls.length > 0) log(`Posted thread: ${allUrls[0]}`);
  return { category: "thread", tweetUrls, blueskyUrls, linkedinUrls, content: tweets.join("\n---\n"), topic };
}

// ── Post an article (mega-thread) ───────────────────────────────────

async function postArticleContent(dryRun: boolean, platforms: Platform[]): Promise<BotResult | null> {
  const recentTopics = await getRecentTopics("article");
  const { tweets, topic, title } = await generateArticle(recentTopics);

  log(`Generated article [${topic}]: "${title}" — ${tweets.length} tweets`);

  // Generate branded header card for the first tweet
  let headerCard: Buffer | undefined;
  try {
    headerCard = await generateThreadCard(title, "article");
    log(`Article header card generated (${Math.round(headerCard.length / 1024)}KB)`);
  } catch (err) {
    log(`Article card generation failed: ${err instanceof Error ? err.message : String(err)} — posting text-only`);
  }

  if (dryRun) {
    if (headerCard) {
      const path = saveDryRunCard(headerCard, "article");
      log(`[DRY RUN] Card saved → ${path}`);
    }
    log("[DRY RUN] Would post article thread" + (headerCard ? " with header card" : ""));
    await recordPost({
      category: "article",
      tweetIds: [],
      tweetUrls: [],
      content: JSON.stringify({ title, tweets }),
      status: "draft",
      topic,
    });
    return { category: "article", tweetUrls: [], blueskyUrls: [], linkedinUrls: [], content: tweets.join("\n---\n"), topic };
  }

  const { tweetUrls, blueskyUrls, blueskyUris, linkedinUrls } = await postThreadToAll(tweets, platforms, false, headerCard);

  const allUrls = [...tweetUrls, ...blueskyUrls, ...linkedinUrls];
  const metadata: Record<string, unknown> = {};
  if (blueskyUris.length > 0) metadata.bluesky_uris = blueskyUris;
  if (linkedinUrls.length > 0) metadata.linkedin_urls = linkedinUrls;
  await recordPost({
    category: "article",
    tweetIds: tweetUrls.map((u) => u.split("/").pop() || ""),
    tweetUrls: allUrls,
    content: JSON.stringify({ title, tweets }),
    status: allUrls.length > 0 ? "posted" : "failed",
    topic,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  });

  if (allUrls.length > 0) log(`Posted article: ${allUrls[0]}`);
  return { category: "article", tweetUrls, blueskyUrls, linkedinUrls, content: tweets.join("\n---\n"), topic };
}

// ── Post a founder story (scraped + enriched + screenshot + thread) ──

async function postFounderStory(dryRun: boolean, platforms: Platform[]): Promise<BotResult | null> {
  const recentTopics = await getRecentTopics("founder_story");

  log("Founder story: scraping TrustMRR + Indie Hackers...");
  const stories = await scrapeFounderStories(recentTopics);

  if (stories.length === 0) {
    log("No new founder stories found — skipping");
    return null;
  }

  log(`Found ${stories.length} stories after dedup`);

  // Pick a random story from top 15
  const pool = stories.slice(0, Math.min(15, stories.length));
  let story = pool[Math.floor(Math.random() * pool.length)];

  log(`Selected: ${story.name} — ${story.mrr}/mo`);

  // Enrich: fetch the TrustMRR detail page for product URL + better description
  log("Enriching story from detail page...");
  story = await enrichStoryFromTrustMRR(story);
  if (story.productUrl) {
    log(`Product URL: ${story.productUrl}`);
  } else {
    log("No product URL found — will use source link");
  }

  // Screenshot the actual product website (not TrustMRR)
  let screenshot: Buffer | undefined;
  const screenshotUrl = story.productUrl || story.sourceUrl;
  try {
    log(`Screenshotting ${screenshotUrl}...`);
    screenshot = await screenshotSite(screenshotUrl);
    log(`Screenshot captured (${Math.round(screenshot.length / 1024)}KB)`);
  } catch (err) {
    log(`Screenshot failed: ${err instanceof Error ? err.message : String(err)} — will use card only`);
  }

  // Generate viral hook tweet + reply breakdown
  const { hookTweet, replyTweet, headline } = await generateFounderStoryThread(
    {
      name: story.name,
      mrr: story.mrr,
      growth: story.growth,
      founder: story.founder,
      description: story.description,
      productUrl: story.productUrl,
      sourceUrl: story.sourceUrl,
      source: story.source,
    },
    recentTopics
  );

  log(`Hook: "${hookTweet.slice(0, 80)}..."`);
  log(`Reply: "${replyTweet.slice(0, 80)}..."`);
  log(`Headline: "${headline}"`);

  // Generate branded card with the big metric
  let card: Buffer | undefined;
  try {
    card = await generateFounderStoryCard(headline, story.name);
    log(`Founder story card generated (${Math.round(card.length / 1024)}KB)`);
  } catch (err) {
    log(`Card generation failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Decide media for the hook tweet: prefer screenshot, fall back to card
  const hookMedia = screenshot || card;

  // Build thread: hook tweet (with media) + reply tweet
  const tweets = [hookTweet, replyTweet];

  const fullContent = `${hookTweet}\n---\n${replyTweet}`;

  if (dryRun) {
    if (card) {
      const cardPath = saveDryRunCard(card, "founder-story-card");
      log(`[DRY RUN] Card saved → ${cardPath}`);
    }
    if (screenshot) {
      const ssPath = saveDryRunCard(screenshot, "founder-story-ss");
      log(`[DRY RUN] Screenshot saved → ${ssPath}`);
    }
    log("[DRY RUN] Would post founder story thread:");
    log(`  Tweet 1 (hook): ${hookTweet}`);
    log(`  Tweet 2 (reply): ${replyTweet}`);
    await recordPost({
      category: "founder_story",
      tweetIds: [],
      tweetUrls: [],
      content: fullContent,
      status: "draft",
      topic: story.name,
      metadata: {
        source_url: story.sourceUrl,
        product_url: story.productUrl,
        source: story.source,
      },
    });
    return { category: "founder_story", tweetUrls: [], blueskyUrls: [], linkedinUrls: [], content: fullContent, topic: story.name };
  }

  // Post as a thread with media on the first tweet
  const { tweetUrls, blueskyUrls, blueskyUris, linkedinUrls } = await postThreadToAll(
    tweets, platforms, false, hookMedia
  );

  const allUrls = [...tweetUrls, ...blueskyUrls, ...linkedinUrls];
  const metadata: Record<string, unknown> = {
    source_url: story.sourceUrl,
    product_url: story.productUrl,
    source: story.source,
  };
  if (blueskyUris.length > 0) metadata.bluesky_uris = blueskyUris;
  if (linkedinUrls.length > 0) metadata.linkedin_urls = linkedinUrls;
  await recordPost({
    category: "founder_story",
    tweetIds: tweetUrls.map((u) => u.split("/").pop() || ""),
    tweetUrls: allUrls,
    content: fullContent,
    status: allUrls.length > 0 ? "posted" : "failed",
    topic: story.name,
    metadata,
  });

  for (const url of allUrls) log(`Posted: ${url}`);
  return { category: "founder_story", tweetUrls, blueskyUrls, linkedinUrls, content: fullContent, topic: story.name };
}

// ── Post a video short ─────────────────────────────────────────────

async function postShort(dryRun: boolean, platforms: Platform[]): Promise<BotResult | null> {
  log("Shorts: running shorts pipeline...");

  // Map Platform[] to PostingPlatform[] (exclude linkedin — shorts pipeline only supports twitter/bluesky)
  const shortsPlatforms = platforms
    .filter((p): p is "twitter" | "bluesky" => p === "twitter" || p === "bluesky");

  if (shortsPlatforms.length === 0 && !dryRun) {
    log("Shorts: no supported platforms configured (need twitter or bluesky) — skipping");
    return null;
  }

  const result = await runShortsPipeline({
    autoApprove: true,
    platforms: shortsPlatforms,
    dryRun,
  });

  if (result.status === "failed") {
    if (result.error?.includes("rate limit")) {
      log("Shorts: weekly rate limit reached — skipping");
      return null;
    }
    throw new Error(result.error || "Shorts pipeline failed");
  }

  const tweetUrls: string[] = [];
  const blueskyUrls: string[] = [];
  const postUrls: string[] = [];

  for (const pr of result.postResults || []) {
    if (pr.postUrl) {
      postUrls.push(pr.postUrl);
      if (pr.platform === "twitter") tweetUrls.push(pr.postUrl);
      if (pr.platform === "bluesky") blueskyUrls.push(pr.postUrl);
    }
  }

  // Record in growth bot table for quota tracking
  await recordPost({
    category: "shorts",
    tweetIds: tweetUrls.map((u) => u.split("/").pop() || ""),
    tweetUrls: postUrls,
    content: `[video short] ${result.topic}`,
    status: postUrls.length > 0 || dryRun ? (dryRun ? "draft" : "posted") : "failed",
    topic: result.topic,
    metadata: { videoShortId: result.videoShortId, category: result.category },
  });

  for (const url of postUrls) log(`Posted short: ${url}`);
  return { category: "shorts", tweetUrls, blueskyUrls, linkedinUrls: [], content: `[video short] ${result.topic}`, topic: result.topic };
}

// ── Post a trending take ──────────────────────────────────────────

async function postTrending(dryRun: boolean, platforms: Platform[]): Promise<BotResult | null> {
  log("Trending: discovering what's hot...");
  const items = await discoverTrending();

  if (items.length === 0) {
    log("No trending items found — skipping");
    return null;
  }

  // Pick the top item
  const item = items[0];
  log(`Trending item [${item.format}]: "${item.headline.slice(0, 80)}..."`);

  const recentTopics = await getRecentTopics("trending");
  const { tweet, topic } = await generateTrendingTweet(item, recentTopics);

  log(`Generated trending [${topic}]: "${tweet.slice(0, 80)}..."`);

  // Trending posts: main tweet (text-only) + reply with source link so readers can verify.
  // Drastic claims without sources damage credibility.
  const sourceReply = `Source: ${item.sourceUrl}`;

  if (dryRun) {
    log("[DRY RUN] Would post trending (text + source reply)");
    log(`  Tweet: ${tweet}`);
    log(`  Reply: ${sourceReply}`);
    await recordPost({
      category: "trending",
      tweetIds: [],
      tweetUrls: [],
      content: `${tweet}\n---\n${sourceReply}`,
      status: "draft",
      topic,
      metadata: {
        source_url: item.sourceUrl,
        source_type: item.sourceType,
        format: item.format,
        tweet_context: item.tweetContext || null,
      },
    });
    return { category: "trending", tweetUrls: [], blueskyUrls: [], linkedinUrls: [], content: tweet, topic };
  }

  // Post main tweet to all platforms
  const { tweetUrls, blueskyUrls, blueskyUris, linkedinUrls } = await postTextToAll(tweet, platforms, false);

  // Reply with source link on Twitter (so readers can verify the claim)
  if (tweetUrls.length > 0) {
    const mainTweetId = tweetUrls[0].split("/").pop();
    if (mainTweetId) {
      try {
        const reply = await replyToTweet({ text: sourceReply, inReplyToTweetId: mainTweetId });
        log(`Source reply posted: ${reply.tweetUrl}`);
      } catch (err) {
        log(`Source reply failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const allUrls = [...tweetUrls, ...blueskyUrls, ...linkedinUrls];
  const metadata: Record<string, unknown> = {
    source_url: item.sourceUrl,
    source_type: item.sourceType,
    format: item.format,
    tweet_context: item.tweetContext || null,
  };
  if (blueskyUris.length > 0) metadata.bluesky_uris = blueskyUris;
  if (linkedinUrls.length > 0) metadata.linkedin_urls = linkedinUrls;

  await recordPost({
    category: "trending",
    tweetIds: tweetUrls.map((u) => u.split("/").pop() || ""),
    tweetUrls: allUrls,
    content: `${tweet}\n---\n${sourceReply}`,
    status: allUrls.length > 0 ? "posted" : "failed",
    topic,
    metadata,
  });

  for (const url of allUrls) log(`Posted: ${url}`);
  return { category: "trending", tweetUrls, blueskyUrls, linkedinUrls, content: tweet, topic };
}

// ── Main entry point ────────────────────────────────────────────────

type SlotHandler = (dryRun: boolean, platforms: Platform[]) => Promise<BotResult | null>;

const SLOT_HANDLERS: Record<ContentSlot, SlotHandler> = {
  trending: postTrending,
  showcase: postShowcase,
  founder_story: postFounderStory,
  tip: postTip,
  thread: postThreadContent,
  article: postArticleContent,
  shorts: postShort,
};

export async function runGrowthBot(options?: {
  dryRun?: boolean;
  category?: ContentSlot;
  count?: number;
  platform?: "twitter" | "bluesky" | "linkedin" | "all";
}): Promise<BotRunResult> {
  const dryRun = options?.dryRun ?? false;
  const forcedCategory = options?.category;
  const count = options?.count ?? 1;
  const platformFilter = options?.platform || "all";
  const result: BotRunResult = { posted: [], skipped: [], errors: [] };

  let platforms = dryRun ? [] : getActivePlatforms();
  if (!dryRun && platformFilter !== "all") {
    platforms = platforms.filter((p) => p === platformFilter);
  }

  if (!dryRun && platforms.length === 0) {
    result.errors.push("No platforms configured — set Twitter, Bluesky, or LinkedIn credentials");
    log("ERROR: No platforms configured. Set Twitter (TWITTER_CLIENT_ID etc.), Bluesky (BLUESKY_IDENTIFIER etc.), or LinkedIn (LINKEDIN_PLATFORM_ACCESS_TOKEN etc.) credentials.");
    return result;
  }

  if (!dryRun) {
    log(`Active platforms: ${platforms.join(", ")}`);
  }

  for (let i = 0; i < count; i++) {
    // Try slots in priority order; if a slot has no content, skip to the next one
    const skipSlots = new Set<ContentSlot>();
    let posted: BotResult | null = null;

    while (!posted) {
      const slot = forcedCategory || (await getNextContentSlot(skipSlots));
      if (!slot) {
        if (skipSlots.size > 0) {
          result.skipped.push("All slots either filled or have no content");
          log("All slots exhausted — nothing to post");
        } else {
          result.skipped.push("No remaining quota for today");
          log("All daily quotas filled — nothing to post");
        }
        break;
      }

      log(`Slot ${i + 1}/${count}: ${slot}${dryRun ? " [DRY RUN]" : ""}`);

      try {
        const handler = SLOT_HANDLERS[slot];
        posted = await handler(dryRun, platforms);
        if (posted) {
          result.posted.push(posted);
        } else {
          log(`${slot}: no content available — trying next slot`);
          skipSlots.add(slot);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${slot}: ${msg}`);
        log(`ERROR [${slot}]: ${msg}`);
        skipSlots.add(slot);

        try {
          await recordPost({
            category: slot,
            tweetIds: [],
            tweetUrls: [],
            content: "",
            status: "failed",
            error: msg,
          });
        } catch {
          // ignore recording errors
        }
      }
    }
  }

  return result;
}

// Backwards-compatible alias
export const runTwitterGrowthBot = runGrowthBot;
