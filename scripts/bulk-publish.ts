/**
 * Bulk-publish demo companies to the Artha platform.
 *
 * Reads a JSON file of company data and for each company:
 *   1. Inserts project, company_profile, documents, memory into platform DB
 *   2. Builds HTML from LandingPageContent via the template system
 *   3. Creates a GitHub repo and pushes the website
 *   4. Sets up Cloudflare Pages via Direct Upload (no GitHub webhook dependency)
 *   5. Takes a screenshot and posts to Twitter + Bluesky with company details
 *   6. Marks the project as active + published
 *
 * Usage:
 *   npx tsx scripts/bulk-publish.ts data/companies.json
 *   npx tsx scripts/bulk-publish.ts data/companies.json --dry-run
 *   npx tsx scripts/bulk-publish.ts data/companies.json --start=10 --count=5
 *   npx tsx scripts/bulk-publish.ts data/companies.json --no-tweets
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import ws from "ws";

// Library imports (relative paths — tsx resolves TS natively)
import { buildLandingPageHtml } from "../src/lib/ai/website-builder/website-template";
import type { LandingPageContent } from "../src/lib/ai/website-builder/website-template";
import { buildTrackingScript } from "../src/lib/analytics-tracking-script";
import { buildChatWidgetScript } from "../src/lib/chat-widget-script";
import { buildArthaBadgeScript } from "../src/lib/artha-badge";
import { ensureCompanyRepo, pushWebsite } from "../src/lib/github";
import { postTweetWithMedia, postTweet } from "../src/lib/twitter";
import { postToBlueskyWithMedia, postToBluesky, isBlueskyConfigured } from "../src/lib/growth/bluesky";
import { screenshotSite } from "../src/lib/screenshot";

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
const NO_TWEETS = process.argv.includes("--no-tweets");
const JSON_FILE = process.argv.find((a) => a.endsWith(".json"));
const START_INDEX = (() => {
  const flag = process.argv.find((a) => a.startsWith("--start="));
  return flag ? parseInt(flag.split("=")[1], 10) || 0 : 0;
})();
const COUNT = (() => {
  const flag = process.argv.find((a) => a.startsWith("--count="));
  return flag ? parseInt(flag.split("=")[1], 10) || Infinity : Infinity;
})();

if (!JSON_FILE) {
  console.error("Usage: npx tsx scripts/bulk-publish.ts <companies.json> [--dry-run] [--start=N] [--count=N] [--no-tweets]");
  process.exit(1);
}

// ── Constants ─────────────────────────────────────────────────────────
const DEMO_USER_ID = process.env.DEMO_USER_ID;
const API_BASE = process.env.NEXT_PUBLIC_APP_URL || "https://artha.run";
const COMPANY_DOMAIN = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
const GITHUB_ORG = process.env.GITHUB_ORG || "artha-companies";
const CF_API = "https://api.cloudflare.com/client/v4";
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN!;
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const CF_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;

// ── Types ─────────────────────────────────────────────────────────────
interface DemoCompany {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  mission: string;
  marketResearch: string;
  landingPage: LandingPageContent;
}

// ── Inline injectIntoHead (avoids importing website.ts which has DB deps) ──
function injectIntoHead(html: string, injection: string): string {
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>\n${injection}`);
  }
  return `<!DOCTYPE html><html><head>${injection}</head><body>${html}</body></html>`;
}

// ── Delay helper ──────────────────────────────────────────────────────
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Cloudflare helpers ────────────────────────────────────────────────
function cfHeaders() {
  return {
    Authorization: `Bearer ${CF_TOKEN}`,
    "Content-Type": "application/json",
  };
}

/**
 * Deploy website to Cloudflare Pages via Direct Upload.
 * Creates the Pages project if needed, uploads files, sets up DNS + custom domain.
 * This bypasses GitHub webhook dependency entirely.
 */
async function deployToCloudflare(slug: string, html: string): Promise<{ siteUrl: string; deployed: boolean }> {
  const siteUrl = `https://${slug}.${COMPANY_DOMAIN}`;

  // 1. Ensure Pages project exists (idempotent)
  const createRes = await fetch(`${CF_API}/accounts/${CF_ACCOUNT_ID}/pages/projects`, {
    method: "POST",
    headers: cfHeaders(),
    body: JSON.stringify({
      name: slug,
      production_branch: "main",
      build_config: { build_command: "", destination_dir: "website" },
      source: {
        type: "github",
        config: {
          owner: GITHUB_ORG,
          repo_name: slug,
          production_branch: "main",
          deployments_enabled: true,
        },
      },
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    if (!/already exists|already been taken/i.test(text)) {
      throw new Error(`Cloudflare Pages project creation failed: ${createRes.status} ${text}`);
    }
  }

  // 2. Ensure DNS CNAME
  if (CF_ZONE_ID) {
    const customDomain = `${slug}.${COMPANY_DOMAIN}`;

    // Get project subdomain (may differ from slug if recreated)
    const projRes = await fetch(`${CF_API}/accounts/${CF_ACCOUNT_ID}/pages/projects/${slug}`, {
      headers: cfHeaders(),
    });
    let pagesTarget = `${slug}.pages.dev`;
    if (projRes.ok) {
      const projData = (await projRes.json()) as { result?: { subdomain?: string } };
      if (projData.result?.subdomain) {
        pagesTarget = projData.result.subdomain;
      }
    }

    // Check existing DNS
    const listRes = await fetch(
      `${CF_API}/zones/${CF_ZONE_ID}/dns_records?name=${encodeURIComponent(customDomain)}`,
      { headers: cfHeaders() }
    );
    if (listRes.ok) {
      const listData = (await listRes.json()) as { result?: Array<{ id: string; type: string; content: string }> };
      const records = listData.result ?? [];
      const existing = records.find((r) => r.type === "CNAME");
      if (existing && existing.content !== pagesTarget) {
        // Update CNAME to correct target
        await fetch(`${CF_API}/zones/${CF_ZONE_ID}/dns_records/${existing.id}`, {
          method: "PATCH",
          headers: cfHeaders(),
          body: JSON.stringify({ content: pagesTarget }),
        });
      } else if (!existing) {
        // Delete conflicting records and create CNAME
        for (const r of records) {
          await fetch(`${CF_API}/zones/${CF_ZONE_ID}/dns_records/${r.id}`, {
            method: "DELETE",
            headers: cfHeaders(),
          });
        }
        await fetch(`${CF_API}/zones/${CF_ZONE_ID}/dns_records`, {
          method: "POST",
          headers: cfHeaders(),
          body: JSON.stringify({ type: "CNAME", name: slug, content: pagesTarget, proxied: true, ttl: 1 }),
        });
      }
    }

    // Add custom domain to project (idempotent)
    await fetch(`${CF_API}/accounts/${CF_ACCOUNT_ID}/pages/projects/${slug}/domains`, {
      method: "POST",
      headers: cfHeaders(),
      body: JSON.stringify({ name: customDomain }),
    });
  }

  // 3. Direct Upload deployment — upload HTML files directly
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
    throw new Error(`Cloudflare Direct Upload failed: ${uploadRes.status} ${text}`);
  }

  // 4. Wait for deployment
  const maxWait = 60_000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const checkRes = await fetch(
      `${CF_API}/accounts/${CF_ACCOUNT_ID}/pages/projects/${slug}/deployments?sort_by=created_on&sort_order=desc&per_page=1`,
      { headers: cfHeaders() }
    );
    if (checkRes.ok) {
      const data = (await checkRes.json()) as { result?: Array<{ latest_stage?: { name?: string; status?: string } }> };
      const stage = data.result?.[0]?.latest_stage;
      if (stage?.name === "deploy" && stage?.status === "success") {
        return { siteUrl, deployed: true };
      }
      if (stage?.status === "failure") {
        return { siteUrl, deployed: false };
      }
    }
    await delay(3000);
  }

  return { siteUrl, deployed: true }; // timeout — may still be deploying
}

// ── Tweet text builders ───────────────────────────────────────────────

function buildTweetText(co: DemoCompany): string {
  const siteUrl = `https://${co.slug}.${COMPANY_DOMAIN}`;
  const intro = `${co.name} — ${co.tagline}`;
  const body = co.description.length > 120
    ? co.description.substring(0, 117) + "..."
    : co.description;

  const text = `${intro}\n\n${body}\n\n${siteUrl}\n\nBuilt with @tryarthaHQ — describe your idea, we build your company`;
  if (text.length <= 280) return text;
  return `${intro}\n\n${siteUrl}\n\nBuilt with @tryarthaHQ — describe your idea, we build your company`.substring(0, 280);
}

function buildBlueskyText(co: DemoCompany): string {
  const siteUrl = `https://${co.slug}.${COMPANY_DOMAIN}`;
  const intro = `${co.name} — ${co.tagline}`;
  const promo = `\n\nBuilt with Artha (artha.run)`;
  const maxBody = 300 - intro.length - siteUrl.length - promo.length - 6;

  if (maxBody > 30) {
    const body = co.description.length > maxBody
      ? co.description.substring(0, maxBody - 3) + "..."
      : co.description;
    return `${intro}\n\n${body}\n\n${siteUrl}${promo}`;
  }
  return `${intro}\n\n${siteUrl}${promo}`;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  // Validate env
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl && !DRY_RUN) {
    console.error("Missing DATABASE_URL env var");
    process.exit(1);
  }
  if (!DEMO_USER_ID && !DRY_RUN) {
    console.error("Missing DEMO_USER_ID env var (UUID of the user who will own all demo companies)");
    process.exit(1);
  }

  // Read JSON
  const filePath = join(process.cwd(), JSON_FILE!);
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const raw = readFileSync(filePath, "utf-8");
  let companies: DemoCompany[];
  try {
    companies = JSON.parse(raw);
    if (!Array.isArray(companies)) throw new Error("Expected a JSON array");
  } catch (e) {
    console.error(`Invalid JSON: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  // Slice based on --start and --count
  const slice = companies.slice(START_INDEX, START_INDEX + COUNT);
  console.log(`\n=== Bulk Publish: ${slice.length} companies (of ${companies.length} total) ===`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}${NO_TWEETS ? " (no tweets)" : ""}\n`);

  if (DRY_RUN) {
    // Validate each company and test HTML generation
    let valid = 0;
    for (let i = 0; i < slice.length; i++) {
      const co = slice[i];
      try {
        if (!co.slug || !co.name || !co.landingPage) {
          throw new Error(`Missing required fields (slug, name, or landingPage)`);
        }
        const html = buildLandingPageHtml(co.landingPage);
        if (!html || html.length < 100) {
          throw new Error("Generated HTML is too short");
        }
        console.log(`  [${i + 1}/${slice.length}] OK  ${co.slug} (${co.name}) — ${html.length} chars`);
        valid++;
      } catch (e) {
        console.error(`  [${i + 1}/${slice.length}] ERR ${co.slug || "??"}: ${e instanceof Error ? e.message : e}`);
      }
    }
    console.log(`\nDry run complete: ${valid}/${slice.length} valid`);
    return;
  }

  // Live mode
  const pool = new Pool({ connectionString: dbUrl });
  const stats = { succeeded: 0, skipped: 0, failed: 0, failedSlugs: [] as string[] };

  try {
    for (let i = 0; i < slice.length; i++) {
      const co = slice[i];
      const label = `[${i + 1}/${slice.length}] ${co.slug}`;

      try {
        // 1. Check if slug already exists (resume capability)
        const existing = await pool.query("SELECT id FROM projects WHERE slug = $1 LIMIT 1", [co.slug]);
        if (existing.rows.length > 0) {
          console.log(`  ${label} — SKIP (already exists)`);
          stats.skipped++;
          continue;
        }

        console.log(`  ${label} — creating...`);

        // 2. Insert project (marked as demo so slug is permanently reserved)
        const projectResult = await pool.query(
          `INSERT INTO projects (
            user_id, name, slug, status,
            company_email, email_setup_status, tweet_setup_status,
            landing_page_published, cloudflare_setup_status,
            memory, task_credits, is_demo
          ) VALUES ($1, $2, $3, 'active', $4, 'skipped', 'skipped', FALSE, 'pending', $5, 0, TRUE)
          RETURNING id`,
          [
            DEMO_USER_ID,
            co.name,
            co.slug,
            `${co.slug}@${COMPANY_DOMAIN}`,
            JSON.stringify({ companyDescription: co.description }),
          ]
        );
        const projectId = projectResult.rows[0].id as string;

        // 3. Insert company_profile
        await pool.query(
          `INSERT INTO company_profile (project_id, name, tagline, domain, settings)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (project_id) DO UPDATE SET name=$2, tagline=$3, domain=$4, settings=$5`,
          [
            projectId,
            co.name,
            co.tagline,
            `${co.slug}.${COMPANY_DOMAIN}`,
            JSON.stringify({ show_in_showcase: true }),
          ]
        );

        // 4. Insert documents (mission + market research)
        await pool.query(
          `INSERT INTO documents (project_id, type, title, content) VALUES ($1, 'mission', 'Mission Statement', $2)`,
          [projectId, co.mission]
        );
        await pool.query(
          `INSERT INTO documents (project_id, type, title, content) VALUES ($1, 'market_research', 'Market Research', $2)`,
          [projectId, co.marketResearch]
        );

        // 5. Insert memory key-value pairs
        const memoryPairs = [
          ["companyName", co.name],
          ["companyDescription", co.description],
          ["companyTagline", co.tagline],
          ["companyMission", co.mission.substring(0, 500)],
        ];
        for (const [key, value] of memoryPairs) {
          await pool.query(
            `INSERT INTO memory (project_id, key, value) VALUES ($1, $2, $3)
             ON CONFLICT (project_id, key) DO UPDATE SET value = $3`,
            [projectId, key, JSON.stringify(value)]
          );
        }

        // 6. Build HTML from LandingPageContent
        const html = buildLandingPageHtml(co.landingPage);

        // 7. Inject tracking + chat widget + badge scripts
        const trackingTag = `<script>${buildTrackingScript(co.slug, API_BASE)}</script>`;
        const chatWidgetTag = `<script>${buildChatWidgetScript(co.slug, API_BASE)}</script>`;
        const badgeTag = `<script>${buildArthaBadgeScript(co.slug)}</script>`;
        const finalHtml = injectIntoHead(html, trackingTag + chatWidgetTag + badgeTag);

        // 8. Update project with HTML + insert page
        await pool.query(
          `UPDATE projects SET landing_page_html = $1, landing_page_published = TRUE WHERE id = $2`,
          [finalHtml, projectId]
        );

        const now = new Date().toISOString();
        await pool.query(
          `INSERT INTO pages (project_id, slug, title, html, published, metadata)
           VALUES ($1, 'index', $2, $3, TRUE, $4)
           ON CONFLICT (project_id, slug) DO UPDATE SET
             title = $2, html = $3, published = TRUE, metadata = $4, updated_at = NOW()`,
          [
            projectId,
            co.name,
            finalHtml,
            JSON.stringify({
              hasUnpublishedChanges: false,
              deploymentStatus: "deployed",
              deploymentError: null,
              lastDraftUpdatedAt: now,
              lastDeployedAt: now,
            }),
          ]
        );

        // 9. Create GitHub repo + push website
        console.log(`  ${label} — pushing to GitHub...`);
        const repo = await ensureCompanyRepo(co.slug);
        await pool.query(
          `UPDATE projects SET github_repo_url = $1, github_repo_full_name = $2 WHERE id = $3`,
          [repo.repoUrl, repo.fullName, projectId]
        );

        await pushWebsite(repo.fullName, finalHtml, "", {
          name: co.name,
          slug: co.slug,
          companyName: co.name,
          tagline: co.tagline,
          email: `${co.slug}@${COMPANY_DOMAIN}`,
          missionSummary: co.description,
          generatedAt: now,
        });

        // 10. Deploy to Cloudflare via Direct Upload (bypasses GitHub webhook)
        console.log(`  ${label} — deploying to Cloudflare...`);
        const { siteUrl, deployed } = await deployToCloudflare(co.slug, finalHtml);
        if (!deployed) {
          console.warn(`  ${label} — deployment not confirmed within timeout (site may still be deploying)`);
        }

        // 11. Mark Cloudflare as configured
        await pool.query(
          `UPDATE projects SET cloudflare_setup_status = 'configured', cloudflare_setup_error = NULL WHERE id = $1`,
          [projectId]
        );

        // 12. Post announcement to Twitter + Bluesky (with screenshot)
        if (!NO_TWEETS) {
          // Wait for Cloudflare to propagate — sites can take a few minutes to go live
          console.log(`  ${label} — waiting 3 minutes for Cloudflare propagation...`);
          await delay(180_000);

          let screenshot: Buffer | null = null;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              screenshot = await screenshotSite(siteUrl, { waitMs: 8000 });
              if (screenshot && screenshot.length > 5000) {
                console.log(`  ${label} — screenshot: ${screenshot.length} bytes (attempt ${attempt})`);
                break;
              }
              console.warn(`  ${label} — screenshot too small (${screenshot?.length || 0} bytes), retrying...`);
              screenshot = null;
            } catch (ssErr) {
              console.warn(`  ${label} — screenshot attempt ${attempt} failed: ${ssErr instanceof Error ? ssErr.message : ssErr}`);
            }
            if (attempt < 3) await delay(30_000);
          }

          // Twitter
          const tweetText = buildTweetText(co);
          try {
            const tweet = screenshot
              ? await postTweetWithMedia({ text: tweetText, media: screenshot })
              : await postTweet({ text: tweetText });
            console.log(`  ${label} — tweeted: ${tweet.tweetUrl}`);

            await pool.query(
              `INSERT INTO tweets (project_id, content, tweet_url, tweet_id, type, status, posted_at)
               VALUES ($1, $2, $3, $4, 'launch', 'posted', NOW())`,
              [projectId, tweetText, tweet.tweetUrl, tweet.tweetId]
            );
          } catch (tweetErr) {
            console.warn(`  ${label} — tweet failed: ${tweetErr instanceof Error ? tweetErr.message : tweetErr}`);
          }

          // Bluesky
          if (isBlueskyConfigured()) {
            const bskyText = buildBlueskyText(co);
            try {
              const bskyPost = screenshot
                ? await postToBlueskyWithMedia({ text: bskyText, media: screenshot, alt: `${co.name} — ${co.tagline}` })
                : await postToBluesky({ text: bskyText });
              console.log(`  ${label} — bluesky: ${bskyPost.postUrl}`);
            } catch (bskyErr) {
              console.warn(`  ${label} — bluesky failed: ${bskyErr instanceof Error ? bskyErr.message : bskyErr}`);
            }
          }
        }

        console.log(`  ${label} — DONE -> ${siteUrl}`);
        stats.succeeded++;

        // Small delay between companies to avoid rate limits
        if (i < slice.length - 1) {
          await delay(2000);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`  ${label} — FAILED: ${msg}`);
        stats.failed++;
        stats.failedSlugs.push(co.slug);
        // Continue to next company
        await delay(1000);
      }
    }
  } finally {
    await pool.end();
  }

  // Summary
  console.log(`\n=== Summary ===`);
  console.log(`  Succeeded: ${stats.succeeded}`);
  console.log(`  Skipped:   ${stats.skipped}`);
  console.log(`  Failed:    ${stats.failed}`);
  if (stats.failedSlugs.length > 0) {
    console.log(`  Failed slugs: ${stats.failedSlugs.join(", ")}`);
  }
  console.log();
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
