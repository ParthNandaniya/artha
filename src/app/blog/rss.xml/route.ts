import { getPublishedPosts } from "@/lib/blog";

export async function GET() {
  const posts = await getPublishedPosts(1, 20);

  const items = posts
    .map((post) => {
      const pubDate = post.publishedAt
        ? new Date(post.publishedAt).toUTCString()
        : new Date(post.createdAt).toUTCString();
      const description = escapeXml(post.excerpt || post.title);
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>https://artha.run/blog/${post.slug}</link>
      <guid isPermaLink="true">https://artha.run/blog/${post.slug}</guid>
      <description>${description}</description>
      <pubDate>${pubDate}</pubDate>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Artha Blog</title>
    <link>https://artha.run/blog</link>
    <description>Insights on AI company building, SaaS growth, and running your business with AI agents.</description>
    <language>en-us</language>
    <atom:link href="https://artha.run/blog/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
