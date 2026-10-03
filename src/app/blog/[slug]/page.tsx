import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPostBySlug, getRecentPosts, estimateReadingTime, formatPublishedDate } from "@/lib/blog";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return { title: "Post Not Found — Artha" };

  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt || "";

  const ogImageUrl = post.coverImageUrl || `https://artha.run/api/og/blog/${post.slug}`;
  const ogImages = [{ url: ogImageUrl, width: 1200, height: 630, alt: title }];

  return {
    title: `${title} — Artha Blog`,
    description,
    openGraph: {
      type: "article",
      title,
      description,
      url: `https://artha.run/blog/${post.slug}`,
      siteName: "Artha",
      publishedTime: post.publishedAt || undefined,
      ...(ogImages ? { images: ogImages } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
    alternates: {
      canonical: `https://artha.run/blog/${post.slug}`,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const relatedPosts = await getRecentPosts(4);
  const related = relatedPosts.filter((p) => p.slug !== post.slug).slice(0, 3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: { "@type": "Organization", name: "Artha", url: "https://artha.run" },
    publisher: { "@type": "Organization", name: "Artha", url: "https://artha.run" },
    mainEntityOfPage: `https://artha.run/blog/${post.slug}`,
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://artha.run" },
      { "@type": "ListItem", position: 2, name: "Blog", item: "https://artha.run/blog" },
      { "@type": "ListItem", position: 3, name: post.title, item: `https://artha.run/blog/${post.slug}` },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([jsonLd, breadcrumbJsonLd]) }}
      />

      <article className="max-w-3xl mx-auto w-full px-6 py-12">
        {/* Header */}
        <header className="mb-10">
          <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4">
            {post.publishedAt && (
              <time dateTime={new Date(post.publishedAt).toISOString()}>
                {formatPublishedDate(post.publishedAt)}
              </time>
            )}
            <span>&middot;</span>
            <span>{estimateReadingTime(post.content)} min read</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-4">
            {post.title}
          </h1>
          {post.excerpt && (
            <p className="text-lg text-muted-foreground leading-relaxed">
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
        </header>

        {/* Cover image */}
        {post.coverImageUrl && (
          <div className="mb-10 rounded-xl overflow-hidden border border-border/50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.coverImageUrl}
              alt={`${post.title} — hero screenshot`}
              className="w-full object-cover"
              loading="eager"
            />
          </div>
        )}

        {/* Content */}
        <div
          className="blog-content prose prose-neutral max-w-none"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {/* Share */}
        <div className="mt-12 pt-8 border-t border-border/50">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Share:</span>
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(`https://artha.run/blog/${post.slug}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Twitter
            </a>
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`https://artha.run/blog/${post.slug}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              LinkedIn
            </a>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 rounded-xl bg-foreground text-primary-foreground p-8 text-center">
          <h2 className="font-display text-2xl font-bold mb-2">Build your company with AI</h2>
          <p className="text-primary-foreground/70 mb-6">
            Describe your idea in one prompt. Artha builds your website, finds customers, and runs marketing.
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 rounded-lg bg-white text-foreground font-semibold text-sm hover:bg-white/90 transition-colors"
          >
            Try Artha free &rarr;
          </Link>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <div className="mt-16">
            <h3 className="font-display text-xl font-bold text-foreground mb-6">More from the blog</h3>
            <div className="space-y-4">
              {related.map((p) => (
                <Link
                  key={p.id}
                  href={`/blog/${p.slug}`}
                  className="block border border-border/50 rounded-lg p-4 hover:border-foreground/20 transition-colors"
                >
                  <h4 className="font-semibold text-foreground mb-1">{p.title}</h4>
                  {p.excerpt && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{p.excerpt}</p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>
    </>
  );
}
