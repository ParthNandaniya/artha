/**
 * Publish showcase blog posts for companies built on Artha.
 *
 * For each published company:
 *   1. Takes a screenshot of their hero page
 *   2. Uploads screenshot to R2 as blog/covers/{postSlug}.png
 *   3. Generates a 1200-1800 word showcase blog post via AI
 *   4. Publishes to the Artha blog with the cover image
 *
 * Usage:
 *   npx tsx scripts/publish-company-showcases.ts
 *   npx tsx scripts/publish-company-showcases.ts --limit=5
 *   npx tsx scripts/publish-company-showcases.ts --slug=some-company
 */

import "dotenv/config";
import { getDb } from "@/lib/neon";
import { screenshotSite } from "@/lib/screenshot";
import { uploadToR2 } from "@/lib/r2";
import { generateCompanyShowcasePost } from "@/lib/agents/company-showcase-writer";
import { createBlogPost, ensureUniqueSlug, getRecentPostTitles } from "@/lib/blog";
import { postTweetWithMedia } from "@/lib/twitter";
import { postToBluesky, postToBlueskyWithMedia, isBlueskyConfigured } from "@/lib/growth/bluesky";

const COMPANY_DOMAIN = process.env.COMPANY_SITE_DOMAIN || "tryartha.com";
// Always use production URL for blog cover image paths (never localhost)
const rawUrl = process.env.NEXT_PUBLIC_APP_URL || "https://artha.run";
const BASE_URL = rawUrl.includes("localhost") ? "https://artha.run" : rawUrl;

async function getPublishedCompanies(limit: number, slugFilter?: string) {
  const db = getDb();

  if (slugFilter) {
    const rows = await db`
      SELECT p.slug, p.name, p.landing_page_published,
             cp.tagline, cp.domain, cp.founder_role,
             p.brand_kit,
             (SELECT content FROM documents WHERE project_id = p.id AND type = 'mission' ORDER BY created_at DESC LIMIT 1) AS mission
      FROM projects p
      LEFT JOIN company_profile cp ON cp.project_id = p.id
      WHERE p.slug = ${slugFilter}
        AND p.status = 'active'
        AND p.landing_page_published = TRUE
        AND COALESCE(p.hidden, false) = false
      LIMIT 1
    `;
    return rows;
  }

  const rows = await db`
    SELECT p.slug, p.name, p.landing_page_published,
           cp.tagline, cp.domain, cp.founder_role,
           p.brand_kit,
           (SELECT content FROM documents WHERE project_id = p.id AND type = 'mission' ORDER BY created_at DESC LIMIT 1) AS mission
    FROM projects p
    LEFT JOIN company_profile cp ON cp.project_id = p.id
    WHERE p.status = 'active'
      AND p.landing_page_published = TRUE
      AND COALESCE(p.hidden, false) = false
      AND (cp.settings->>'show_in_showcase' IS NULL OR cp.settings->>'show_in_showcase' != 'false')
      AND NOT EXISTS (
        SELECT 1 FROM blog_posts b
        WHERE b.source_type = 'company_showcase'
          AND b.tags @> ARRAY[p.slug]
      )
    ORDER BY p.created_at DESC
    LIMIT ${limit}
  `;
  return rows;
}

async function processCompany(row: Record<string, unknown>, recentTitles: string[]) {
  const slug = row.slug as string;
  const name = row.name as string;
  const domain = (row.domain as string) || `${slug}.${COMPANY_DOMAIN}`;
  const siteUrl = `https://${domain}`;

  console.log(`\n[${slug}] Processing: ${name} — ${siteUrl}`);

  // 1. Screenshot
  console.log(`[${slug}] Taking screenshot...`);
  let screenshotBuffer: Buffer | null = null;
  try {
    screenshotBuffer = await screenshotSite(siteUrl, {
      width: 1280,
      height: 800,
      waitMs: 4000,
    });
    console.log(`[${slug}] Screenshot captured (${Math.round(screenshotBuffer.length / 1024)}KB)`);
  } catch (err) {
    console.warn(`[${slug}] Screenshot failed, continuing without image:`, err);
  }

  // 2. Generate blog post content
  console.log(`[${slug}] Generating showcase post...`);
  const showcase = await generateCompanyShowcasePost({
    name,
    slug,
    tagline: (row.tagline as string) || null,
    mission: (row.mission as string) || null,
    domain,
    founderRole: (row.founder_role as string) || null,
    brandKit: (row.brand_kit as Record<string, unknown>) || undefined,
  });

  // Ensure unique slug (avoid collision with existing posts)
  if (recentTitles.includes(showcase.title)) {
    showcase.slug = await ensureUniqueSlug(`${showcase.slug}-${slug}`);
  } else {
    showcase.slug = await ensureUniqueSlug(showcase.slug);
  }

  // 3. Upload screenshot to R2
  let coverImageUrl: string | undefined;
  if (screenshotBuffer) {
    const r2Key = `blog/covers/${showcase.slug}.png`;
    console.log(`[${slug}] Uploading screenshot to R2: ${r2Key}`);
    await uploadToR2({ key: r2Key, body: screenshotBuffer, contentType: "image/png" });
    coverImageUrl = `${BASE_URL}/api/blog/cover/${showcase.slug}`;
    console.log(`[${slug}] Cover image URL: ${coverImageUrl}`);
  }

  // 4. Publish blog post
  console.log(`[${slug}] Publishing blog post: "${showcase.title}"`);
  const post = await createBlogPost({
    slug: showcase.slug,
    title: showcase.title,
    excerpt: showcase.excerpt,
    content: showcase.content,
    tags: [...showcase.tags, slug], // include company slug as tag for dedup tracking
    seoTitle: showcase.seoTitle,
    seoDescription: showcase.seoDescription,
    sourceType: "company_showcase",
    coverImageUrl,
  });

  const blogUrl = `${BASE_URL}/blog/${post.slug}`;
  console.log(`[${slug}] Published: ${blogUrl}`);

  // 5. Share to Twitter + Bluesky (best-effort)
  const tweetText = `We just built ${name} on Artha — ${showcase.excerpt}\n\n${blogUrl}`;
  const bskyExcerptMax = 300 - name.length - blogUrl.length - 30;
  const bskyExcerpt = showcase.excerpt.length > bskyExcerptMax ? showcase.excerpt.slice(0, bskyExcerptMax - 1) + "…" : showcase.excerpt;
  const bskyText = `We just built ${name} on Artha — ${bskyExcerpt}\n\n${blogUrl}`;

  try {
    if (screenshotBuffer) {
      const tweet = await postTweetWithMedia({ text: tweetText, media: screenshotBuffer });
      console.log(`[${slug}] Tweeted: ${tweet.tweetUrl}`);
    } else {
      const { postTweet } = await import("@/lib/twitter");
      const tweet = await postTweet({ text: tweetText });
      console.log(`[${slug}] Tweeted: ${tweet.tweetUrl}`);
    }
  } catch (e) {
    console.warn(`[${slug}] Twitter failed:`, e instanceof Error ? e.message : e);
  }

  if (isBlueskyConfigured()) {
    try {
      if (screenshotBuffer) {
        const bsky = await postToBlueskyWithMedia({ text: bskyText, media: screenshotBuffer, alt: `${name} hero page` });
        console.log(`[${slug}] Bluesky: ${bsky.postUrl}`);
      } else {
        const bsky = await postToBluesky({ text: bskyText });
        console.log(`[${slug}] Bluesky: ${bsky.postUrl}`);
      }
    } catch (e) {
      console.warn(`[${slug}] Bluesky failed:`, e instanceof Error ? e.message : e);
    }
  }

  return post;
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const slugArg = args.find((a) => a.startsWith("--slug="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 10;
  const slugFilter = slugArg ? slugArg.split("=")[1] : undefined;

  console.log("=== Company Showcase Blog Publisher ===");
  console.log(`Limit: ${limit}${slugFilter ? ` | Filter: ${slugFilter}` : ""}`);

  const companies = await getPublishedCompanies(limit, slugFilter);
  console.log(`Found ${companies.length} companies to process`);

  if (companies.length === 0) {
    console.log("No new companies to showcase. All caught up!");
    process.exit(0);
  }

  const recentTitles = await getRecentPostTitles(50);

  let published = 0;
  let failed = 0;

  for (const row of companies) {
    try {
      await processCompany(row as Record<string, unknown>, recentTitles);
      published++;
      // Small delay between companies to avoid rate limits
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      console.error(`Failed to process ${row.slug}:`, err);
      failed++;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Published: ${published} | Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
