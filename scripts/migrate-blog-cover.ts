/**
 * One-time migration: add cover_image_url to blog_posts table
 */
import "dotenv/config";
import { getDb } from "@/lib/neon";

async function main() {
  const db = getDb();
  await db`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS cover_image_url TEXT`;
  console.log("Migration complete: blog_posts.cover_image_url added");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
