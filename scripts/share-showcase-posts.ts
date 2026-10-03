/**
 * One-time: share already-published showcase posts to Twitter + Bluesky.
 * Pass slugs as args, or shares all unshared showcase posts if none given.
 *
 * Usage:
 *   npx tsx scripts/share-showcase-posts.ts quicksaver denari-fin numera-capital
 *   npx tsx scripts/share-showcase-posts.ts   # shares all showcase posts
 */

import "dotenv/config";
import { getDb } from "@/lib/neon";
import { getFromR2 } from "@/lib/r2";
import { postTweetWithMedia, postTweet } from "@/lib/twitter";
import { postToBluesky, postToBlueskyWithMedia, isBlueskyConfigured } from "@/lib/growth/bluesky";

const BASE_URL = "https://artha.run";

async function main() {
  const slugFilter = process.argv.slice(2);
  const db = getDb();

  const rows = slugFilter.length > 0
    ? await db`
        SELECT slug, title, excerpt, cover_image_url
        FROM blog_posts
        WHERE source_type = 'company_showcase'
          AND status = 'published'
          AND slug = ANY(${slugFilter})
        ORDER BY published_at DESC
      `
    : await db`
        SELECT slug, title, excerpt, cover_image_url
        FROM blog_posts
        WHERE source_type = 'company_showcase'
          AND status = 'published'
        ORDER BY published_at DESC
        LIMIT 20
      `;

  console.log(`Sharing ${rows.length} showcase posts...`);

  for (const row of rows) {
    const slug = row.slug as string;
    const title = row.title as string;
    const excerpt = row.excerpt as string;
    const coverImageUrl = row.cover_image_url as string | null;

    const blogUrl = `${BASE_URL}/blog/${slug}`;
    const tweetText = `${title}\n\n${excerpt}\n\n${blogUrl}`;
    // Bluesky has a 300 grapheme limit — truncate excerpt if needed
    const bskyExcerptMax = 300 - title.length - blogUrl.length - 6;
    const bskyExcerpt = excerpt.length > bskyExcerptMax ? excerpt.slice(0, bskyExcerptMax - 1) + "…" : excerpt;
    const bskyText = `${title}\n\n${bskyExcerpt}\n\n${blogUrl}`;

    console.log(`\n[${slug}] Sharing: "${title}"`);

    // Load screenshot from R2 if cover exists
    let imageBuffer: Buffer | null = null;
    if (coverImageUrl) {
      const r2Key = `blog/covers/${slug}.png`;
      try {
        const file = await getFromR2(r2Key);
        if (file) imageBuffer = file.body;
      } catch {
        console.warn(`[${slug}] Could not load cover from R2`);
      }
    }

    // Twitter
    try {
      if (imageBuffer) {
        const tweet = await postTweetWithMedia({ text: tweetText, media: imageBuffer });
        console.log(`[${slug}] Twitter: ${tweet.tweetUrl}`);
      } else {
        const tweet = await postTweet({ text: tweetText });
        console.log(`[${slug}] Twitter: ${tweet.tweetUrl}`);
      }
    } catch (e) {
      console.warn(`[${slug}] Twitter failed:`, e instanceof Error ? e.message : e);
    }

    // Bluesky
    if (isBlueskyConfigured()) {
      try {
        if (imageBuffer) {
          const bsky = await postToBlueskyWithMedia({ text: bskyText, media: imageBuffer, alt: title });
          console.log(`[${slug}] Bluesky: ${bsky.postUrl}`);
        } else {
          const bsky = await postToBluesky({ text: bskyText });
          console.log(`[${slug}] Bluesky: ${bsky.postUrl}`);
        }
      } catch (e) {
        console.warn(`[${slug}] Bluesky failed:`, e instanceof Error ? e.message : e);
      }
    }

    // Small delay between posts to avoid rate limits
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
