/**
 * Delete / hide a project:
 *   1. Delete Cloudflare Pages project (removes the CDN site)
 *   2. Delete DNS CNAME record ({slug}.tryartha.com)
 *   3. Set hidden = true, landing_page_published = false in DB
 *   4. Optionally delete Neon company DB (--delete-db)
 *   5. Optionally hard-delete the project row (--hard-delete)
 *
 * Usage:
 *   npx tsx scripts/delete-project.ts <slug>                  # soft delete (hide + remove from CDN)
 *   npx tsx scripts/delete-project.ts <slug> --delete-db      # also delete company Neon DB
 *   npx tsx scripts/delete-project.ts <slug> --hard-delete    # full hard delete (DB row + all infra)
 *   npx tsx scripts/delete-project.ts <slug> --dry-run        # preview only
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import https from "https";
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
const slug = process.argv[2];
const DRY_RUN = process.argv.includes("--dry-run");
const DELETE_DB = process.argv.includes("--delete-db");
const HARD_DELETE = process.argv.includes("--hard-delete");

if (!slug) {
  console.error("Usage: npx tsx scripts/delete-project.ts <slug> [--delete-db] [--hard-delete] [--dry-run]");
  process.exit(1);
}

// ── Cloudflare config ────────────────────────────────────────────────
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN!;
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const CF_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID!;
const COMPANY_DOMAIN = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";

// ── HTTP helper (Node 16 compatible) ─────────────────────────────────
function httpsRequest(
  method: string,
  url: string,
  token: string,
  body?: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() })
        );
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Cloudflare helpers ────────────────────────────────────────────────
async function deleteCustomDomainsFromPages(projectSlug: string): Promise<void> {
  const { status, body } = await httpsRequest(
    "GET",
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectSlug}/domains`,
    CF_TOKEN
  );
  if (status !== 200) return;

  const data = JSON.parse(body) as { result?: Array<{ id: string; name: string }> };
  const domains = data.result ?? [];

  for (const d of domains) {
    // Skip the default *.pages.dev domain — Cloudflare won't let you delete it and it goes away with the project
    if (d.name.endsWith(".pages.dev")) continue;
    console.log(`   Removing custom domain: ${d.name}`);
    await httpsRequest(
      "DELETE",
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectSlug}/domains/${d.name}`,
      CF_TOKEN
    );
  }
}

async function deletePagesProject(projectSlug: string): Promise<boolean> {
  // Must remove custom domains first — Cloudflare requires it
  await deleteCustomDomainsFromPages(projectSlug);

  const { status, body } = await httpsRequest(
    "DELETE",
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectSlug}`,
    CF_TOKEN
  );
  if (status === 200 || status === 404) return true;
  console.error(`  Failed to delete Pages project: ${status} ${body}`);
  return false;
}

async function deleteDnsRecords(domain: string): Promise<number> {
  const { status, body } = await httpsRequest(
    "GET",
    `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records?name=${encodeURIComponent(domain)}`,
    CF_TOKEN
  );
  if (status !== 200) return 0;

  const data = JSON.parse(body) as { result?: Array<{ id: string; type: string; name: string }> };
  const records = data.result ?? [];

  // Safety: only delete records that exactly match this domain
  const matching = records.filter((r) => r.name === domain);
  for (const record of matching) {
    console.log(`   Deleting ${record.type} record: ${record.name} (${record.id})`);
    await httpsRequest(
      "DELETE",
      `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records/${record.id}`,
      CF_TOKEN
    );
  }
  return matching.length;
}

// ── Neon helper ───────────────────────────────────────────────────────
async function deleteNeonProject(neonProjectId: string): Promise<boolean> {
  const apiKey = process.env.NEON_API_KEY;
  if (!apiKey) {
    console.error("  NEON_API_KEY not set, skipping Neon deletion");
    return false;
  }
  const { status, body } = await httpsRequest(
    "DELETE",
    `https://console.neon.tech/api/v2/projects/${neonProjectId}`,
    apiKey
  );
  if (status === 200 || status === 404) return true;
  console.error(`  Failed to delete Neon project: ${status} ${body}`);
  return false;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { rows } = await pool.query(
    `SELECT p.id, p.slug, p.name, p.neon_project_id, p.github_repo_full_name, p.status, p.landing_page_published,
            p.user_id, u.email AS user_email, u.name AS user_name
     FROM projects p
     JOIN users u ON u.id = p.user_id
     WHERE p.slug = $1`,
    [slug]
  );

  if (rows.length === 0) {
    console.error(`Project with slug "${slug}" not found.`);
    process.exit(1);
  }

  const project = rows[0];
  const domain = `${project.slug}.${COMPANY_DOMAIN}`;

  console.log(`\nProject: ${project.name} (${project.slug})`);
  console.log(`  ID:     ${project.id}`);
  console.log(`  Status: ${project.status}`);
  console.log(`  Domain: ${domain}`);
  console.log(`  Neon:   ${project.neon_project_id || "none"}`);
  console.log(`  User:   ${project.user_name} (${project.user_email})`);
  console.log(`  Mode:   ${HARD_DELETE ? "HARD DELETE" : "SOFT DELETE (hide)"}`);
  if (DRY_RUN) console.log(`  DRY RUN — no changes will be made\n`);
  else console.log();

  if (DRY_RUN) {
    console.log("Would perform:");
    console.log("  1. Delete Cloudflare Pages project");
    console.log(`  2. Delete DNS records for ${domain}`);
    if (HARD_DELETE || DELETE_DB) {
      if (project.neon_project_id) console.log("  3. Delete Neon company DB");
    }
    if (HARD_DELETE) {
      console.log("  4. DELETE project row from DB");
    } else {
      console.log("  3. Set hidden=true, landing_page_published=false on project in DB");
      console.log("  4. Set hidden=true on user in DB (no more emails)");
    }
    await pool.end();
    return;
  }

  // 1. Delete Cloudflare Pages project
  console.log("1. Deleting Cloudflare Pages project...");
  const pagesOk = await deletePagesProject(project.slug);
  console.log(`   ${pagesOk ? "Done" : "Failed (continuing)"}`);

  // 2. Delete DNS records for this specific subdomain only
  console.log(`2. Deleting DNS records for ${domain}...`);
  const dnsCount = await deleteDnsRecords(domain);
  console.log(`   Deleted ${dnsCount} DNS record(s)`);

  // 3. Optionally delete Neon DB
  if ((HARD_DELETE || DELETE_DB) && project.neon_project_id) {
    console.log("3. Deleting Neon company DB...");
    const neonOk = await deleteNeonProject(project.neon_project_id);
    console.log(`   ${neonOk ? "Done" : "Failed (continuing)"}`);
  }

  // 4. Update or delete project in platform DB
  if (HARD_DELETE) {
    console.log("4. Hard-deleting project row from DB...");
    await pool.query(`DELETE FROM projects WHERE id = $1`, [project.id]);
    console.log("   Done");
  } else {
    const step = (HARD_DELETE || DELETE_DB) && project.neon_project_id ? "4" : "3";
    console.log(`${step}. Hiding project in DB...`);
    await pool.query(
      `UPDATE projects SET hidden = true, landing_page_published = false WHERE id = $1`,
      [project.id]
    );
    console.log("   Set hidden=true, landing_page_published=false");

    // Also hide the user so they won't receive any emails
    const nextStep = parseInt(step) + 1;
    console.log(`${nextStep}. Hiding user in DB...`);
    await pool.query(
      `UPDATE users SET hidden = true WHERE id = $1`,
      [project.user_id]
    );
    console.log(`   Set hidden=true on user ${project.user_email}`);
  }

  console.log("\nDone!\n");
  await pool.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
