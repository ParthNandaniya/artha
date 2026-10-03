import { NextResponse } from "next/server";
import { getDb } from "@/lib/neon";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";

  try {
    const db = getDb();

    const projects = await db`
      SELECT p.slug, p.created_at,
             COALESCE(pg.updated_at, p.created_at) AS last_modified
      FROM projects p
      LEFT JOIN pages pg ON pg.project_id = p.id AND pg.slug = 'index'
      WHERE p.landing_page_published = TRUE
        AND p.slug IS NOT NULL
        AND COALESCE(p.hidden, false) = false
      ORDER BY last_modified DESC
    `;

    // Build URLs including extra pages for each project
    const allUrls: string[] = [];
    for (const p of projects) {
      const lastmod = p.last_modified
        ? new Date(p.last_modified as string).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      // Main page
      allUrls.push(`  <url>
    <loc>https://${p.slug}.${companyDomain}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <lastmod>${lastmod}</lastmod>
  </url>`);

      // Extra pages for this project
      const extraPages = await db`
        SELECT slug, updated_at FROM pages
        WHERE project_id = (SELECT id FROM projects WHERE slug = ${p.slug} LIMIT 1)
          AND slug != 'index' AND html IS NOT NULL
        LIMIT 20
      `;
      for (const ep of extraPages) {
        const epLastmod = ep.updated_at
          ? new Date(ep.updated_at as string).toISOString().split("T")[0]
          : lastmod;
        allUrls.push(`  <url>
    <loc>https://${p.slug}.${companyDomain}/${ep.slug}.html</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <lastmod>${epLastmod}</lastmod>
  </url>`);
      }
    }

    // Cross-reference: include key artha.run pages so both domains boost each other
    const arthaBase = "https://artha.run";
    const today = new Date().toISOString().split("T")[0];
    const arthaUrls = [
      { path: "/", priority: "0.8" },
      { path: "/companies", priority: "0.7" },
      { path: "/blog", priority: "0.6" },
      { path: "/tools", priority: "0.6" },
      { path: "/pricing", priority: "0.5" },
    ].map(
      (p) => `  <url>
    <loc>${arthaBase}${p.path}</loc>
    <changefreq>weekly</changefreq>
    <priority>${p.priority}</priority>
    <lastmod>${today}</lastmod>
  </url>`
    );

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...allUrls, ...arthaUrls].join("\n")}
</urlset>`;

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    console.error("[sitemap-companies] Failed to generate sitemap:", err instanceof Error ? err.message : err, err instanceof Error ? err.stack : "");
    // Return a valid empty sitemap instead of 500 so crawlers don't bail
    const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- error: ${err instanceof Error ? err.message : "unknown"} -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`;
    return new NextResponse(emptyXml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=60",
      },
    });
  }
}
