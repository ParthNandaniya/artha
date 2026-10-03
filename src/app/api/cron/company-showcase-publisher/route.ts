/**
 * Nightly cron: publish showcase blog posts for companies created today.
 *
 * Schedule: 9 PM daily (configure in Render / cron scheduler)
 * Auth: Bearer CRON_SECRET
 *
 * For each new company built today:
 *   1. Screenshot their landing page
 *   2. Upload to R2
 *   3. Generate 1200-1800 word showcase post via Claude Sonnet
 *   4. Publish to artha.run/blog
 *   5. Post to Twitter + Bluesky with the hero screenshot
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import { screenshotSite } from "@/lib/screenshot";
import { uploadToR2 } from "@/lib/r2";
import { generateCompanyShowcasePost } from "@/lib/agents/company-showcase-writer";
import { createBlogPost, ensureUniqueSlug } from "@/lib/blog";
import { postTweetWithMedia, postTweet } from "@/lib/twitter";
import { postToBluesky, postToBlueskyWithMedia, isBlueskyConfigured } from "@/lib/growth/bluesky";
import { generateFounderStoryCard } from "@/lib/growth/card-generator";

const BASE_URL = "https://artha.run";
const COMPANY_DOMAIN = process.env.COMPANY_SITE_DOMAIN || "tryartha.com";

async function getNewCompaniesToday() {
  const db = getDb();
  const rows = await db`
    SELECT p.slug, p.name,
           cp.tagline, cp.domain, cp.founder_role,
           p.brand_kit,
           (SELECT content FROM documents WHERE project_id = p.id AND type = 'mission' ORDER BY created_at DESC LIMIT 1) AS mission
    FROM projects p
    LEFT JOIN company_profile cp ON cp.project_id = p.id
    WHERE p.status = 'active'
      AND p.landing_page_published = TRUE
      AND COALESCE(p.hidden, false) = false
      AND p.created_at >= NOW() - INTERVAL '24 hours'
      AND (cp.settings->>'show_in_showcase' IS NULL OR cp.settings->>'show_in_showcase' != 'false')
      AND NOT EXISTS (
        SELECT 1 FROM blog_posts b
        WHERE b.source_type = 'company_showcase'
          AND b.tags @> ARRAY[p.slug]
      )
    ORDER BY p.created_at DESC
  `;
  return rows;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Array<{ slug: string; status: "published" | "failed"; blogUrl?: string; error?: string }> = [];

  try {
    const companies = await getNewCompaniesToday();

    if (companies.length === 0) {
      return NextResponse.json({ skipped: true, reason: "No new companies today" });
    }

    for (const row of companies) {
      const slug = row.slug as string;
      const name = row.name as string;
      const domain = (row.domain as string) || `${slug}.${COMPANY_DOMAIN}`;
      const siteUrl = `https://${domain}`;

      try {
        // 1. Screenshot the company landing page (fallback to branded card)
        let screenshotBuffer: Buffer | null = null;
        try {
          screenshotBuffer = await screenshotSite(siteUrl, { width: 1280, height: 800, waitMs: 4000 });
        } catch (screenshotErr) {
          console.warn(`[showcase-cron] Screenshot failed for ${slug}, generating branded card fallback:`, screenshotErr);
          try {
            const tagline = (row.tagline as string) || "";
            screenshotBuffer = await generateFounderStoryCard(name, tagline || undefined);
          } catch (cardErr) {
            console.warn(`[showcase-cron] Card fallback also failed for ${slug}:`, cardErr);
          }
        }

        // 2. Generate showcase post via Claude Sonnet
        const showcase = await generateCompanyShowcasePost({
          name,
          slug,
          tagline: (row.tagline as string) || null,
          mission: (row.mission as string) || null,
          domain,
          founderRole: (row.founder_role as string) || null,
          brandKit: (row.brand_kit as Record<string, unknown>) || undefined,
        });

        const finalSlug = await ensureUniqueSlug(showcase.slug);

        // 3. Upload screenshot to R2
        let coverImageUrl: string | undefined;
        if (screenshotBuffer) {
          const r2Key = `blog/covers/${finalSlug}.png`;
          await uploadToR2({ key: r2Key, body: screenshotBuffer, contentType: "image/png" });
          coverImageUrl = `${BASE_URL}/api/blog/cover/${finalSlug}`;
        }

        // 4. Publish blog post
        const post = await createBlogPost({
          slug: finalSlug,
          title: showcase.title,
          excerpt: showcase.excerpt,
          content: showcase.content,
          tags: [...showcase.tags, slug],
          seoTitle: showcase.seoTitle,
          seoDescription: showcase.seoDescription,
          sourceType: "company_showcase",
          coverImageUrl,
        });

        const blogUrl = `${BASE_URL}/blog/${post.slug}`;
        const tweetText = `We just built ${name} on Artha — ${showcase.excerpt}\n\n${blogUrl}`;
        const bskyExcerptMax = 300 - name.length - blogUrl.length - 30;
        const bskyExcerpt = showcase.excerpt.length > bskyExcerptMax ? showcase.excerpt.slice(0, bskyExcerptMax - 1) + "…" : showcase.excerpt;
        const bskyText = `We just built ${name} on Artha — ${bskyExcerpt}\n\n${blogUrl}`;

        // 5. Post to Twitter
        try {
          if (screenshotBuffer) {
            await postTweetWithMedia({ text: tweetText, media: screenshotBuffer });
          } else {
            await postTweet({ text: tweetText });
          }
        } catch (e) {
          console.warn(`[showcase-cron] Twitter failed for ${slug}:`, e);
        }

        // 6. Post to Bluesky
        if (isBlueskyConfigured()) {
          try {
            if (screenshotBuffer) {
              await postToBlueskyWithMedia({ text: bskyText, media: screenshotBuffer, alt: `${name} hero page` });
            } else {
              await postToBluesky({ text: bskyText });
            }
          } catch (e) {
            console.warn(`[showcase-cron] Bluesky failed for ${slug}:`, e);
          }
        }

        results.push({ slug, status: "published", blogUrl });
      } catch (e) {
        console.error(`[showcase-cron] Failed for ${slug}:`, e);
        results.push({ slug, status: "failed", error: e instanceof Error ? e.message : "unknown" });
      }
    }

    return NextResponse.json({
      published: results.filter((r) => r.status === "published").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    });
  } catch (error) {
    console.error("[showcase-cron] Fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron failed" },
      { status: 500 }
    );
  }
}
