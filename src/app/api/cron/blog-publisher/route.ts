import { NextRequest, NextResponse } from "next/server";
import {
  publishedTodayCount,
  getUnbloggedThreads,
  getRecentPostTitles,
  createBlogPost,
  ensureUniqueSlug,
  generateSlug,
} from "@/lib/blog";
import { generateBlogPost } from "@/lib/agents/blog-writer";
import { postTweet, postTweetWithMedia } from "@/lib/twitter";
import { postToBluesky, postToBlueskyWithMedia, isBlueskyConfigured } from "@/lib/growth/bluesky";
import { postToLinkedInPlatform, isLinkedInPlatformConfigured } from "@/lib/growth/linkedin";
import { generateThreadCard } from "@/lib/growth/card-generator";
import { uploadToR2 } from "@/lib/r2";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Skip if already published today
    const todayCount = await publishedTodayCount();
    if (todayCount > 0) {
      return NextResponse.json({ skipped: true, reason: "Already published today" });
    }

    const recentTitles = await getRecentPostTitles(20);

    // Alternate: even days = thread expansion, odd days = fresh research
    const dayOfMonth = new Date().getDate();
    const useThreadExpansion = dayOfMonth % 2 === 0;

    let mode: "thread_expansion" | "fresh_research" = "fresh_research";
    let threadContent: string | undefined;
    let threadTopic: string | undefined;
    let sourceTweetPostId: string | undefined;

    if (useThreadExpansion) {
      const threads = await getUnbloggedThreads(3);
      if (threads.length > 0) {
        const thread = threads[0];
        mode = "thread_expansion";
        sourceTweetPostId = thread.id;
        threadTopic = thread.topic;

        // Parse thread content — stored as JSON stringified array or plain text
        try {
          const parsed = JSON.parse(thread.content);
          threadContent = Array.isArray(parsed) ? parsed.join("\n\n") : thread.content;
        } catch {
          threadContent = thread.content;
        }
      }
      // Fall back to fresh research if no unblogged threads
    }

    const result = await generateBlogPost({
      mode,
      threadContent,
      threadTopic,
      recentTitles,
    });

    const slug = await ensureUniqueSlug(
      result.slug || generateSlug(result.title),
    );

    // Generate branded cover card for the blog post
    let coverImageUrl: string | undefined;
    let coverBuffer: Buffer | null = null;
    try {
      const cardType = mode === "thread_expansion" ? "thread" : "article";
      coverBuffer = await generateThreadCard(result.title, cardType);
      const r2Key = `blog/covers/${slug}.png`;
      await uploadToR2({ key: r2Key, body: coverBuffer, contentType: "image/png" });
      coverImageUrl = `https://artha.run/api/blog/cover/${slug}`;
    } catch (e) {
      console.warn("[blog-publisher] Cover image generation failed:", e);
    }

    const post = await createBlogPost({
      slug,
      title: result.title,
      excerpt: result.excerpt,
      content: result.content,
      tags: result.tags,
      seoTitle: result.seoTitle,
      seoDescription: result.seoDescription,
      sourceType: mode,
      sourceTweetPostId,
      coverImageUrl,
    });

    // Share to Twitter + Bluesky + LinkedIn (best-effort, don't fail the publish)
    const blogUrl = `https://artha.run/blog/${post.slug}`;
    const socialText = `${post.title}\n\n${result.excerpt}\n\n${blogUrl}`;
    const social: { twitter?: string; bluesky?: string; errors?: string[] } = {};
    const socialErrors: string[] = [];

    try {
      if (coverBuffer) {
        const tweet = await postTweetWithMedia({ text: socialText, media: coverBuffer });
        social.twitter = tweet.tweetUrl;
      } else {
        const tweet = await postTweet({ text: socialText });
        social.twitter = tweet.tweetUrl;
      }
    } catch (e) {
      socialErrors.push(`twitter: ${e instanceof Error ? e.message : "failed"}`);
    }

    if (isBlueskyConfigured()) {
      try {
        if (coverBuffer) {
          const bsky = await postToBlueskyWithMedia({ text: socialText, media: coverBuffer, alt: result.title });
          social.bluesky = bsky.postUrl;
        } else {
          const bsky = await postToBluesky({ text: socialText });
          social.bluesky = bsky.postUrl;
        }
      } catch (e) {
        socialErrors.push(`bluesky: ${e instanceof Error ? e.message : "failed"}`);
      }
    }

    if (isLinkedInPlatformConfigured()) {
      try {
        const li = await postToLinkedInPlatform({ text: socialText });
        (social as Record<string, unknown>).linkedin = li.postUrl;
      } catch (e) {
        socialErrors.push(`linkedin: ${e instanceof Error ? e.message : "failed"}`);
      }
    }

    if (socialErrors.length > 0) social.errors = socialErrors;

    return NextResponse.json({
      published: true,
      postId: post.id,
      slug: post.slug,
      title: post.title,
      mode,
      social,
    });
  } catch (error) {
    console.error("Blog publisher failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Blog publish failed" },
      { status: 500 },
    );
  }
}
