import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedPosts, getPostCount, estimateReadingTime, formatPublishedDate } from "@/lib/blog";

const POSTS_PER_PAGE = 12;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const total = await getPostCount();
  const totalPages = Math.ceil(total / POSTS_PER_PAGE);

  const canonical = page === 1 ? "https://artha.run/blog" : `https://artha.run/blog?page=${page}`;
  const prev = page > 1 ? (page === 2 ? "https://artha.run/blog" : `https://artha.run/blog?page=${page - 1}`) : undefined;
  const next = page < totalPages ? `https://artha.run/blog?page=${page + 1}` : undefined;

  return {
    title: page === 1 ? "Blog — Artha" : `Blog — Page ${page} — Artha`,
    description:
      "Insights on AI company building, SaaS growth, and running your business with AI agents. Written by the team behind Artha.",
    openGraph: {
      title: "Blog — Artha",
      description:
        "Insights on AI company building, SaaS growth, and running your business with AI agents.",
      url: canonical,
    },
    alternates: {
      canonical,
      ...(prev || next
        ? {
            types: {
              ...(prev ? { prev } : {}),
              ...(next ? { next } : {}),
            },
          }
        : {}),
    },
  };
}

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const [posts, total] = await Promise.all([
    getPublishedPosts(page, POSTS_PER_PAGE),
    getPostCount(),
  ]);
  const totalPages = Math.ceil(total / POSTS_PER_PAGE);

  return (
    <div className="max-w-3xl mx-auto w-full px-6 py-12">
      {/* Header */}
      <div className="mb-12">
        <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground mb-3">
          Blog
        </h1>
        <p className="text-lg text-muted-foreground">
          AI company building, SaaS growth, and how we built Artha to automate it all.
        </p>
      </div>

      {/* Posts */}
      {posts.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-lg">No posts yet. Check back soon.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {posts.map((post) => (
            <article key={post.id} className="group">
              <Link href={`/blog/${post.slug}`} className="block">
                <div className="border border-border/50 rounded-xl overflow-hidden hover:border-foreground/20 transition-colors">
                  {post.coverImageUrl && (
                    <div className="aspect-[16/7] overflow-hidden bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={post.coverImageUrl}
                        alt={post.title}
                        className="w-full h-full object-cover object-top"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div className={`p-6`}>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
                    {post.publishedAt && (
                      <time dateTime={new Date(post.publishedAt).toISOString()}>
                        {formatPublishedDate(post.publishedAt)}
                      </time>
                    )}
                    <span>&middot;</span>
                    <span>{estimateReadingTime(post.content)} min read</span>
                  </div>
                  <h2 className="text-xl font-semibold text-foreground group-hover:text-foreground/80 transition-colors mb-2">
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="text-muted-foreground leading-relaxed">
                      {post.excerpt}
                    </p>
                  )}
                  {post.tags.length > 0 && (
                    <div className="flex gap-2 mt-4">
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  </div>
                </div>
              </Link>
            </article>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-12">
          {page > 1 && (
            <Link
              href={`/blog?page=${page - 1}`}
              className="text-sm font-medium text-foreground hover:text-foreground/70"
            >
              &larr; Newer posts
            </Link>
          )}
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/blog?page=${page + 1}`}
              className="text-sm font-medium text-foreground hover:text-foreground/70"
            >
              Older posts &rarr;
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
