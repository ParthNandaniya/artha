import { MetadataRoute } from "next";
import { getPublishedPosts } from "@/lib/blog";
import { FREE_TOOLS } from "@/lib/free-tools";
import { getDb } from "@/lib/neon";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://artha.run";
  const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${base}/live`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/companies`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/blog`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  // Free AI tools pages
  const toolPages: MetadataRoute.Sitemap = [
    { url: `${base}/tools`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    ...FREE_TOOLS.map((tool) => ({
      url: `${base}/tools/${tool.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];

  // Dynamic blog post URLs
  let blogPages: MetadataRoute.Sitemap = [];
  try {
    const posts = await getPublishedPosts(1, 200);
    blogPages = posts.map((post) => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: post.updatedAt ? new Date(post.updatedAt) : new Date(post.createdAt),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch {
    // DB not available during build — skip blog posts
  }

  // Cross-reference: include published company sites from tryartha.com
  let companyPages: MetadataRoute.Sitemap = [];
  try {
    const db = getDb();
    const projects = await db`
      SELECT slug, created_at,
             COALESCE(
               (SELECT updated_at FROM pages WHERE project_id = p.id AND slug = 'index' LIMIT 1),
               created_at
             ) AS last_modified
      FROM projects p
      WHERE landing_page_published = TRUE
        AND slug IS NOT NULL
        AND COALESCE(hidden, false) = false
      ORDER BY last_modified DESC
    `;
    companyPages = projects.map((p) => ({
      url: `https://${p.slug}.${companyDomain}/`,
      lastModified: p.last_modified ? new Date(p.last_modified as string) : now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch {
    // DB not available during build — skip company pages
  }

  return [...staticPages, ...toolPages, ...blogPages, ...companyPages];
}
