/**
 * Disable Cloudflare Web Analytics on ALL existing Pages projects.
 *
 * Cloudflare auto-injects beacon.min.js into every Pages site by default,
 * which triggers Chrome's "Access other apps and services on this device"
 * permission popup. We already have our own analytics, so this is redundant.
 *
 * Usage:
 *   npx tsx scripts/disable-cf-web-analytics.ts              # apply to all projects
 *   npx tsx scripts/disable-cf-web-analytics.ts --dry-run     # preview only
 */

import { readFileSync } from "fs";
import { join } from "path";

// ── Load env ──────────────────────────────────────────────────────────
function loadEnv() {
  for (const envFile of [".env.local", ".env"]) {
    try {
      const content = readFileSync(join(process.cwd(), envFile), "utf-8");
      content.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx < 0) return;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) process.env[key] = val;
      });
    } catch {
      // file doesn't exist, skip
    }
  }
}

loadEnv();

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN!;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const DRY_RUN = process.argv.includes("--dry-run");

if (!API_TOKEN || !ACCOUNT_ID) {
  console.error("Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID");
  process.exit(1);
}

function cfHeaders() {
  return {
    Authorization: `Bearer ${API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

interface PagesProject {
  name: string;
  deployment_configs?: {
    production?: { web_analytics_tag?: string | null; web_analytics_token?: string | null };
    preview?: { web_analytics_tag?: string | null; web_analytics_token?: string | null };
  };
}

async function listAllProjects(): Promise<PagesProject[]> {
  const all: PagesProject[] = [];
  let page = 1;
  const perPage = 10;
  while (true) {
    const url = `${CLOUDFLARE_API}/accounts/${ACCOUNT_ID}/pages/projects`;
    const res = await fetch(url, { method: "GET", headers: cfHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to list projects: ${res.status} ${text}`);
    }
    const data = (await res.json()) as { result: PagesProject[] };
    all.push(...(data.result ?? []));
    // The Pages API returns all projects in a single response
    break;
  }
  return all;
}

async function disableWebAnalytics(projectName: string): Promise<boolean> {
  const res = await fetch(
    `${CLOUDFLARE_API}/accounts/${ACCOUNT_ID}/pages/projects/${projectName}`,
    {
      method: "PATCH",
      headers: cfHeaders(),
      body: JSON.stringify({
        deployment_configs: {
          production: {
            web_analytics_tag: null,
            web_analytics_token: null,
          },
          preview: {
            web_analytics_tag: null,
            web_analytics_token: null,
          },
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error(`  ✗ ${projectName}: ${res.status} ${text}`);
    return false;
  }
  return true;
}

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== Disabling Cloudflare Web Analytics ===");
  console.log();

  const projects = await listAllProjects();
  console.log(`Found ${projects.length} Cloudflare Pages projects\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const project of projects) {
    const prodTag = project.deployment_configs?.production?.web_analytics_tag;
    const prodToken = project.deployment_configs?.production?.web_analytics_token;
    const hasAnalytics = prodTag || prodToken;

    if (!hasAnalytics) {
      console.log(`  ○ ${project.name} — already disabled`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  → ${project.name} — would disable (tag: ${prodTag})`);
      updated++;
      continue;
    }

    const ok = await disableWebAnalytics(project.name);
    if (ok) {
      console.log(`  ✓ ${project.name} — disabled`);
      updated++;
    } else {
      failed++;
    }
  }

  console.log();
  console.log(`Done: ${updated} updated, ${skipped} already clean, ${failed} failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
