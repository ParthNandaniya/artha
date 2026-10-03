/**
 * Fix demo company deployments:
 *   1. Redeploy to Cloudflare via Direct Upload (bypasses GitHub webhook)
 *   2. Take screenshot of each live site
 *   3. Post improved tweets (with screenshot, company description, Artha promo)
 *
 * Usage:
 *   npx tsx scripts/fix-demo-deployments.ts                    # full fix
 *   npx tsx scripts/fix-demo-deployments.ts --deploy-only      # just Cloudflare
 *   npx tsx scripts/fix-demo-deployments.ts --tweets-only      # just re-post tweets
 *   npx tsx scripts/fix-demo-deployments.ts --dry-run          # preview only
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { join } from "path";
import ws from "ws";
import { screenshotSite } from "../src/lib/screenshot";
import { postTweetWithMedia } from "../src/lib/twitter";
import { postToBlueskyWithMedia, isBlueskyConfigured } from "../src/lib/growth/bluesky";

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
const DEPLOY_ONLY = process.argv.includes("--deploy-only");
const TWEETS_ONLY = process.argv.includes("--tweets-only");

// ── Constants ─────────────────────────────────────────────────────────
const CF_API = "https://api.cloudflare.com/client/v4";
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN!;
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const COMPANY_DOMAIN = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";

function cfHeaders(contentType = "application/json") {
  return {
    Authorization: `Bearer ${CF_TOKEN}`,
    "Content-Type": contentType,
  };
}

// ── Delay helper ──────────────────────────────────────────────────────
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Cloudflare Direct Upload ──────────────────────────────────────────

/**
 * Delete existing Pages project and recreate as Direct Upload,
 * then upload files. This bypasses the GitHub webhook issue.
 */
async function deployViaCloudflareDirect(
  slug: string,
  html: string,
  css: string
): Promise<boolean> {
  // 1. Delete existing Pages project (it was GitHub-source and has 0 deployments)
  console.log(`    Deleting old Pages project...`);
  const deleteRes = await fetch(
    `${CF_API}/accounts/${CF_ACCOUNT_ID}/pages/projects/${slug}`,
    { method: "DELETE", headers: cfHeaders() }
  );
  if (!deleteRes.ok && deleteRes.status !== 404) {
    const text = await deleteRes.text();
    console.warn(`    Warning: delete failed (${deleteRes.status}): ${text}`);
  }

  // Small delay to let Cloudflare clean up
  await delay(2000);

  // 2. Create new Pages project (no GitHub source = Direct Upload mode)
  console.log(`    Creating Direct Upload project...`);
  const createRes = await fetch(
    `${CF_API}/accounts/${CF_ACCOUNT_ID}/pages/projects`,
    {
      method: "POST",
      headers: cfHeaders(),
      body: JSON.stringify({
        name: slug,
        production_branch: "main",
        build_config: {
          build_command: "",
          destination_dir: "",
        },
      }),
    }
  );

  if (!createRes.ok) {
    const text = await createRes.text();
    // If already exists (race condition), continue
    if (!/already exists|already been taken/i.test(text)) {
      throw new Error(`Create project failed: ${createRes.status} ${text}`);
    }
  }

  // 3. Re-add custom domain
  console.log(`    Adding custom domain...`);
  await ensureDnsCname(slug);
  const domainRes = await fetch(
    `${CF_API}/accounts/${CF_ACCOUNT_ID}/pages/projects/${slug}/domains`,
    {
      method: "POST",
      headers: cfHeaders(),
      body: JSON.stringify({ name: `${slug}.${COMPANY_DOMAIN}` }),
    }
  );
  if (!domainRes.ok) {
    const text = await domainRes.text();
    if (!/already exists|already been taken/i.test(text)) {
      console.warn(`    Warning: custom domain add failed: ${text}`);
    }
  }

  // 4. Deploy via Direct Upload (multipart form with files)
  console.log(`    Uploading files...`);
  const form = new FormData();

  // Create a simple _headers file for caching
  const headersContent = `/*\n  Cache-Control: public, max-age=3600\n`;

  // Create robots.txt
  const robotsContent = `User-agent: *\nAllow: /\n`;

  // Upload each file as a form field with path as key
  form.append("/index.html", new Blob([html], { type: "text/html" }), "index.html");
  if (css) {
    form.append("/styles.css", new Blob([css], { type: "text/css" }), "styles.css");
  }
  form.append("/_headers", new Blob([headersContent], { type: "text/plain" }), "_headers");
  form.append("/robots.txt", new Blob([robotsContent], { type: "text/plain" }), "robots.txt");

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

  const uploadData = await uploadRes.json() as { result?: { url?: string; latest_stage?: { status?: string } } };
  console.log(`    Deployed: ${uploadData.result?.url || "pending"}`);

  // 5. Wait for deployment to go live
  console.log(`    Waiting for deployment...`);
  const maxWait = 60_000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const checkRes = await fetch(
      `${CF_API}/accounts/${CF_ACCOUNT_ID}/pages/projects/${slug}/deployments?sort_by=created_on&sort_order=desc&per_page=1`,
      { method: "GET", headers: cfHeaders() }
    );
    if (checkRes.ok) {
      const data = await checkRes.json() as { result?: Array<{ latest_stage?: { name?: string; status?: string } }> };
      const stage = data.result?.[0]?.latest_stage;
      if (stage?.name === "deploy" && stage?.status === "success") {
        return true;
      }
      if (stage?.status === "failure") {
        console.warn(`    Deployment failed!`);
        return false;
      }
    }
    await delay(3000);
  }

  console.warn(`    Deployment timed out (may still be deploying)`);
  return false;
}

async function ensureDnsCname(slug: string): Promise<void> {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!zoneId) return;

  const domain = `${slug}.${COMPANY_DOMAIN}`;
  const target = `${slug}.pages.dev`;

  // Check existing
  const listRes = await fetch(
    `${CF_API}/zones/${zoneId}/dns_records?name=${encodeURIComponent(domain)}`,
    { method: "GET", headers: cfHeaders() }
  );

  if (listRes.ok) {
    const data = await listRes.json() as { result?: Array<{ id: string; type: string; content: string }> };
    const records = data.result ?? [];
    const existing = records.find((r) => r.type === "CNAME");
    if (existing && existing.content === target) return; // already correct

    // Delete conflicting records
    for (const record of records) {
      await fetch(`${CF_API}/zones/${zoneId}/dns_records/${record.id}`, {
        method: "DELETE",
        headers: cfHeaders(),
      });
    }
  }

  // Create CNAME
  await fetch(`${CF_API}/zones/${zoneId}/dns_records`, {
    method: "POST",
    headers: cfHeaders(),
    body: JSON.stringify({
      type: "CNAME",
      name: slug,
      content: target,
      proxied: true,
      ttl: 1,
    }),
  });
}

// ── Tweet helpers ─────────────────────────────────────────────────────

function buildTweetText(company: { name: string; tagline: string; description: string; slug: string }): string {
  const siteUrl = `https://${company.slug}.${COMPANY_DOMAIN}`;
  // Keep under 280 chars. Focus on: what it does + URL + Artha promo
  const intro = `${company.name} — ${company.tagline}`;
  const body = company.description.length > 120
    ? company.description.substring(0, 117) + "..."
    : company.description;

  const text = `${intro}\n\n${body}\n\n${siteUrl}\n\nBuilt with @tryarthaHQ — describe your idea, we build your company`;

  // Trim if over 280
  if (text.length <= 280) return text;
  // Shorten description further
  const short = `${intro}\n\n${siteUrl}\n\nBuilt with @tryarthaHQ — describe your idea, we build your company`;
  return short.substring(0, 280);
}

function buildBlueskyText(company: { name: string; tagline: string; description: string; slug: string }): string {
  const siteUrl = `https://${company.slug}.${COMPANY_DOMAIN}`;
  const intro = `${company.name} — ${company.tagline}`;
  const promo = `\n\nBuilt with Artha (artha.run)`;
  const maxBody = 300 - intro.length - siteUrl.length - promo.length - 6; // 6 for newlines

  if (maxBody > 30) {
    const body = company.description.length > maxBody
      ? company.description.substring(0, maxBody - 3) + "..."
      : company.description;
    return `${intro}\n\n${body}\n\n${siteUrl}${promo}`;
  }
  // Fallback: no description
  return `${intro}\n\n${siteUrl}${promo}`;
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
    // Get all demo companies
    const { rows: companies } = await pool.query(`
      SELECT p.id, p.slug, p.name, p.landing_page_html,
             cp.tagline,
             p.memory->>'companyDescription' as description
      FROM projects p
      LEFT JOIN company_profile cp ON cp.project_id = p.id
      WHERE p.is_demo = TRUE
      ORDER BY p.created_at
    `);

    console.log(`\n=== Fix Demo Deployments: ${companies.length} companies ===`);
    console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}${DEPLOY_ONLY ? " (deploy only)" : ""}${TWEETS_ONLY ? " (tweets only)" : ""}\n`);

    if (DRY_RUN) {
      for (const co of companies) {
        console.log(`  ${co.slug} (${co.name})`);
        console.log(`    HTML: ${co.landing_page_html?.length || 0} chars`);
        console.log(`    Tweet: ${buildTweetText(co).substring(0, 100)}...`);
      }
      return;
    }

    const stats = { deployed: 0, tweeted: 0, failed: [] as string[] };

    for (let i = 0; i < companies.length; i++) {
      const co = companies[i];
      const label = `[${i + 1}/${companies.length}] ${co.slug}`;
      const siteUrl = `https://${co.slug}.${COMPANY_DOMAIN}`;

      try {
        // ── Step 1: Deploy to Cloudflare ──
        if (!TWEETS_ONLY) {
          console.log(`  ${label} — deploying to Cloudflare...`);
          const deployed = await deployViaCloudflareDirect(co.slug, co.landing_page_html, "");
          if (deployed) {
            stats.deployed++;
            console.log(`  ${label} — site live at ${siteUrl}`);

            // Update DB status
            await pool.query(
              `UPDATE projects SET cloudflare_setup_status = 'configured', cloudflare_setup_error = NULL WHERE id = $1`,
              [co.id]
            );
          } else {
            console.warn(`  ${label} — deployment may not be live yet`);
          }

          // Wait a bit for DNS propagation
          await delay(5000);
        }

        // ── Step 2: Screenshot + Tweet ──
        if (!DEPLOY_ONLY) {
          console.log(`  ${label} — taking screenshot...`);
          let screenshot: Buffer | null = null;
          try {
            screenshot = await screenshotSite(siteUrl, { waitMs: 5000 });
            console.log(`  ${label} — screenshot: ${screenshot.length} bytes`);
          } catch (e) {
            console.warn(`  ${label} — screenshot failed: ${e instanceof Error ? e.message : e}`);
          }

          // Delete old tweets for this company
          await pool.query(
            `DELETE FROM tweets WHERE project_id = $1 AND type = 'launch'`,
            [co.id]
          );

          // Post to Twitter
          const tweetText = buildTweetText(co);
          try {
            let tweet;
            if (screenshot) {
              tweet = await postTweetWithMedia({ text: tweetText, media: screenshot });
            } else {
              const { postTweet } = await import("../src/lib/twitter");
              tweet = await postTweet({ text: tweetText });
            }
            console.log(`  ${label} — tweeted: ${tweet.tweetUrl}`);

            await pool.query(
              `INSERT INTO tweets (project_id, content, tweet_url, tweet_id, type, status, posted_at)
               VALUES ($1, $2, $3, $4, 'launch', 'posted', NOW())`,
              [co.id, tweetText, tweet.tweetUrl, tweet.tweetId]
            );
            stats.tweeted++;
          } catch (e) {
            console.warn(`  ${label} — tweet failed: ${e instanceof Error ? e.message : e}`);
          }

          // Post to Bluesky
          if (isBlueskyConfigured()) {
            const bskyText = buildBlueskyText(co);
            try {
              let bsky;
              if (screenshot) {
                bsky = await postToBlueskyWithMedia({
                  text: bskyText,
                  media: screenshot,
                  alt: `Screenshot of ${co.name} website — ${co.tagline}`,
                });
              } else {
                const { postToBluesky } = await import("../src/lib/growth/bluesky");
                bsky = await postToBluesky({ text: bskyText });
              }
              console.log(`  ${label} — bluesky: ${bsky.postUrl}`);
            } catch (e) {
              console.warn(`  ${label} — bluesky failed: ${e instanceof Error ? e.message : e}`);
            }
          }
        }

        console.log(`  ${label} — DONE`);

        // Delay between companies
        if (i < companies.length - 1) {
          await delay(3000);
        }
      } catch (e) {
        console.error(`  ${label} — FAILED: ${e instanceof Error ? e.message : e}`);
        stats.failed.push(co.slug);
        await delay(1000);
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`  Deployed: ${stats.deployed}`);
    console.log(`  Tweeted:  ${stats.tweeted}`);
    console.log(`  Failed:   ${stats.failed.length}`);
    if (stats.failed.length > 0) {
      console.log(`  Failed:   ${stats.failed.join(", ")}`);
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
