import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
config();

const db = neon(process.env.DATABASE_URL!);

async function updateBlog(slug: string, updates: {
  title?: string;
  content?: string;
  excerpt?: string;
  seoTitle?: string;
  seoDescription?: string;
  tags?: string[];
}) {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.title) { setClauses.push(`title = $${paramIndex++}`); values.push(updates.title); }
  if (updates.content) { setClauses.push(`content = $${paramIndex++}`); values.push(updates.content); }
  if (updates.excerpt) { setClauses.push(`excerpt = $${paramIndex++}`); values.push(updates.excerpt); }
  if (updates.seoTitle) { setClauses.push(`seo_title = $${paramIndex++}`); values.push(updates.seoTitle); }
  if (updates.seoDescription) { setClauses.push(`seo_description = $${paramIndex++}`); values.push(updates.seoDescription); }
  if (updates.tags) { setClauses.push(`tags = $${paramIndex++}`); values.push(updates.tags); }

  setClauses.push(`updated_at = NOW()`);

  if (setClauses.length === 1) {
    console.log("No updates provided");
    return;
  }

  // Use tagged template literal approach for neon
  const result = await db`
    UPDATE blog_posts
    SET title = COALESCE(${updates.title || null}, title),
        content = COALESCE(${updates.content || null}, content),
        excerpt = COALESCE(${updates.excerpt || null}, excerpt),
        seo_title = COALESCE(${updates.seoTitle || null}, seo_title),
        seo_description = COALESCE(${updates.seoDescription || null}, seo_description),
        tags = COALESCE(${updates.tags || null}, tags),
        updated_at = NOW()
    WHERE slug = ${slug}
    RETURNING slug, title
  `;

  if (result.length === 0) {
    console.error(`No blog post found with slug: ${slug}`);
    process.exit(1);
  }

  console.log(`Updated: ${result[0].slug} — "${result[0].title}"`);
}

// Read from stdin or file
const slug = process.argv[2];
const dataFile = process.argv[3];

if (!slug || !dataFile) {
  console.log("Usage: npx tsx scripts/update-blog.ts <slug> <json-file>");
  process.exit(1);
}

import { readFileSync } from "fs";
const data = JSON.parse(readFileSync(dataFile, "utf-8"));
updateBlog(slug, data).catch(console.error);
