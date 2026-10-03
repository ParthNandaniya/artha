/**
 * Fix localhost:3000 URLs baked into all published company site HTML.
 *
 * Replaces "http://localhost:3000" with "https://artha.run" in:
 *   - projects.landing_page_html
 *   - pages.html (index page)
 * Then re-deploys each site to Cloudflare via Direct Upload.
 *
 * Usage:
 *   npx tsx scripts/fix-localhost-urls.ts --dry-run    # preview only
 *   npx tsx scripts/fix-localhost-urls.ts              # fix + redeploy all
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { join } from "path";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

// ── Load env ──────────────────────────────────────────────────────────
function loadEnv() {
  for (const envFile of [".env.local", ".env"]) {
    try {
      const content = readFileSync(join(process.cwd(), envFile), "utf-8");
      content.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0 && !process.env[key]) {
          process.env[key] = valueParts.join("=").trim();
        }
      });
    } catch {
      // skip missing env files
    }
  }
}

loadEnv();

// ── CLI args ──────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");

// ── Constants ─────────────────────────────────────────────────────────
const CF_API = "https://api.cloudflare.com/client/v4";
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN!;
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const COMPANY_DOMAIN = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";

const FIND = "http://localhost:3000";
const REPLACE = "https://artha.run";

function cfHeaders() {
  return {
    Authorization: `Bearer ${CF_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Cloudflare Direct Upload (no delete/recreate — just upload new files) ──
async function deployToCloudflare(slug: string, html: string): Promise<boolean> {
  const form = new FormData();
  form.append("/index.html", new Blob([html], { type: "text/html" }), "index.html");
  form.append("/robots.txt", new Blob(["User-agent: *\nAllow: /\n"], { type: "text/plain" }), "robots.txt");
  form.append("/_headers", new Blob(["/*\n  Cache-Control: public, max-age=3600\n"], { type: "text/plain" }), "_headers");

  const uploadRes = await fetch(
    `${CF_API}/accounts/${CF_ACCOUNT_ID}/pages/projects/${slug}/deployments`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${CF_TOKEN}` },
      body: form,
    }
  );

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Direct upload failed: ${uploadRes.status} ${text}`);
  }

  // Wait for deployment (short timeout — deploy usually succeeds even if we don't wait)
  const maxWait = 5_000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const checkRes = await fetch(
      `${CF_API}/accounts/${CF_ACCOUNT_ID}/pages/projects/${slug}/deployments?sort_by=created_on&sort_order=desc&per_page=1`,
      { headers: cfHeaders() }
    );
    if (checkRes.ok) {
      const data = (await checkRes.json()) as { result?: Array<{ latest_stage?: { name?: string; status?: string } }> };
      const stage = data.result?.[0]?.latest_stage;
      if (stage?.name === "deploy" && stage?.status === "success") return true;
      if (stage?.status === "failure") return false;
    }
    await delay(3000);
  }
  return true; // timeout — may still be deploying
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl });

  try {
    // Get all published projects with localhost in their HTML
    const { rows: projects } = await pool.query(`
      SELECT p.id, p.slug, p.name, p.landing_page_html
      FROM projects p
      WHERE p.landing_page_published = TRUE
        AND p.slug IS NOT NULL
        AND p.landing_page_html LIKE '%localhost%'
      ORDER BY p.created_at
    `);

    console.log(`\n=== Fix Localhost URLs: ${projects.length} affected sites ===`);
    console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
    console.log(`Replace: "${FIND}" -> "${REPLACE}"\n`);

    if (projects.length === 0) {
      console.log("No sites contain localhost URLs. Nothing to fix.");
      return;
    }

    if (DRY_RUN) {
      for (const p of projects) {
        const count = (p.landing_page_html.match(new RegExp(FIND.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
        console.log(`  ${p.slug} (${p.name}) — ${count} occurrences`);
      }
      console.log(`\nDry run complete: ${projects.length} sites to fix`);
      return;
    }

    // Live mode
    const stats = { fixed: 0, failed: 0, failedSlugs: [] as string[] };

    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      const label = `[${i + 1}/${projects.length}] ${p.slug}`;

      try {
        // Replace localhost URLs
        const fixedHtml = p.landing_page_html.replaceAll(FIND, REPLACE);
        const count = (p.landing_page_html.match(new RegExp(FIND.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
        console.log(`  ${label} — replacing ${count} occurrences...`);

        // Update DB
        await pool.query(
          `UPDATE projects SET landing_page_html = $1 WHERE id = $2`,
          [fixedHtml, p.id]
        );
        await pool.query(
          `UPDATE pages SET html = $1, updated_at = NOW() WHERE project_id = $2 AND slug = 'index'`,
          [fixedHtml, p.id]
        );

        // Re-deploy to Cloudflare
        console.log(`  ${label} — deploying to Cloudflare...`);
        const deployed = await deployToCloudflare(p.slug, fixedHtml);
        if (!deployed) {
          console.warn(`  ${label} — deployment may not be live yet`);
        }

        console.log(`  ${label} — DONE -> https://${p.slug}.${COMPANY_DOMAIN}`);
        stats.fixed++;

        // Small delay between deployments
        if (i < projects.length - 1) {
          await delay(1000);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`  ${label} — FAILED: ${msg}`);
        stats.failed++;
        stats.failedSlugs.push(p.slug);
        await delay(1000);
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`  Fixed:  ${stats.fixed}`);
    console.log(`  Failed: ${stats.failed}`);
    if (stats.failedSlugs.length > 0) {
      console.log(`  Failed slugs: ${stats.failedSlugs.join(", ")}`);
    }
    console.log();
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
