/**
 * Fix failed onboarding steps for recent projects.
 *
 * Scans projects from the last 7 days and retries any steps that failed:
 *   - Mission document generation
 *   - Market research
 *   - Landing page / website build
 *   - GitHub push + Cloudflare deploy
 *   - Task queue generation
 *   - Welcome email
 *
 * Usage:
 *   npm run fix                  # run repairs
 *   npm run fix:dry              # preview what would be fixed
 *   npm run fix -- --days=30     # scan last 30 days
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

const DRY_RUN = process.argv.includes("--dry-run");
const COMPANY_DOMAIN = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
const DAYS_BACK = (() => {
  const flag = process.argv.find((a) => a.startsWith("--days="));
  return flag ? parseInt(flag.split("=")[1], 10) || 7 : 7;
})();

// ── Types ─────────────────────────────────────────────────────────────

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  user_id: string;
  status: string;
  landing_page_html: string | null;
  landing_page_published: boolean;
  github_repo_full_name: string | null;
  cloudflare_setup_status: string | null;
  email_setup_status: string | null;
  company_email: string | null;
  task_credits: number;
  memory: Record<string, unknown> | null;
  tagline: string | null;
  prompt: string | null;
  has_mission: boolean;
  has_research: boolean;
  task_count: number;
  has_welcome_email: boolean;
}

interface FixResult {
  step: string;
  status: "fixed" | "skipped" | "failed";
  message: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

function log(slug: string, icon: string, msg: string) {
  console.log(`   ${icon} [${slug}] ${msg}`);
}

// ── Fix functions ─────────────────────────────────────────────────────

async function fixMission(pool: Pool, project: ProjectRow): Promise<FixResult> {
  if (project.has_mission) return { step: "mission", status: "skipped", message: "Already exists" };

  const prompt = project.prompt || (project.memory?.companyDescription as string) || "";
  if (!prompt) return { step: "mission", status: "skipped", message: "No prompt available" };

  if (DRY_RUN) return { step: "mission", status: "skipped", message: "[DRY RUN] Would generate mission" };

  const { generateMission } = await import("../src/lib/ai/research/mission-generator");
  const { setCompanyMemory } = await import("../src/lib/neon");

  const mission = await generateMission(
    prompt,
    {
      companyName: project.name,
      companyDescription: prompt,
      tagline: project.tagline || undefined,
    },
    undefined
  );

  await pool.query(
    `INSERT INTO documents (project_id, type, title, content, metadata)
     VALUES ($1, 'mission', $2, $3, $4::jsonb)
     ON CONFLICT DO NOTHING`,
    [project.id, mission.title, mission.content, JSON.stringify(mission.metadata)]
  );
  await setCompanyMemory(project.id, "mission", mission.content.slice(0, 300));

  return { step: "mission", status: "fixed", message: "Mission document generated" };
}

async function fixMarketResearch(pool: Pool, project: ProjectRow): Promise<FixResult> {
  if (project.has_research) return { step: "market_research", status: "skipped", message: "Already exists" };

  const prompt = project.prompt || (project.memory?.companyDescription as string) || "";
  if (!prompt) return { step: "market_research", status: "skipped", message: "No prompt available" };

  if (DRY_RUN) return { step: "market_research", status: "skipped", message: "[DRY RUN] Would run market research" };

  const { generateMarketResearch } = await import("../src/lib/ai/research/market-researcher");
  const { setCompanyMemory } = await import("../src/lib/neon");

  const missionDoc = await pool.query(
    `SELECT content FROM documents WHERE project_id = $1 AND type = 'mission' LIMIT 1`,
    [project.id]
  );

  const research = await generateMarketResearch(prompt, {
    companyName: project.name,
    companyDescription: prompt,
    tagline: project.tagline || undefined,
    mission: (missionDoc.rows[0]?.content as string)?.slice(0, 300) || undefined,
  }, { mode: "onboarding" });

  const metadata = research.metadata;
  const competitors = metadata.competitors?.map((c: { name: string }) => c.name) || [];

  await pool.query(
    `INSERT INTO documents (project_id, type, title, content, metadata)
     VALUES ($1, 'market_research', $2, $3, $4::jsonb)
     ON CONFLICT DO NOTHING`,
    [project.id, research.title, research.content, JSON.stringify(metadata)]
  );
  await setCompanyMemory(project.id, "competitors", competitors);
  await setCompanyMemory(project.id, "keyInsights", metadata.gaps || []);

  return { step: "market_research", status: "fixed", message: `${competitors.length} competitors found` };
}

async function fixLandingPage(pool: Pool, project: ProjectRow): Promise<FixResult> {
  if (project.landing_page_html) return { step: "landing_page", status: "skipped", message: "Already exists" };

  const prompt = project.prompt || (project.memory?.companyDescription as string) || "";
  if (!prompt) return { step: "landing_page", status: "skipped", message: "No prompt available" };

  if (DRY_RUN) return { step: "landing_page", status: "skipped", message: "[DRY RUN] Would build landing page" };

  const { generateLandingPage } = await import("../src/lib/ai/website-builder/landing-page-builder");

  const missionDoc = await pool.query(
    `SELECT content FROM documents WHERE project_id = $1 AND type = 'mission' LIMIT 1`,
    [project.id]
  );
  const competitorDocs = await pool.query(
    `SELECT metadata->'competitors' as competitors FROM documents WHERE project_id = $1 AND type = 'market_research' LIMIT 1`,
    [project.id]
  );

  const competitors: string[] = [];
  if (competitorDocs.rows[0]?.competitors) {
    const comps = competitorDocs.rows[0].competitors;
    if (Array.isArray(comps)) {
      competitors.push(...comps.map((c: { name?: string }) => c.name || String(c)).filter(Boolean));
    }
  }

  const buildMemory = {
    companyDescription: prompt,
    mission: (missionDoc.rows[0]?.content as string) || (project.memory?.mission as string) || undefined,
    competitors: competitors.length ? competitors : undefined,
    targetAudience: (project.memory?.targetAudience as string) || undefined,
  };

  const landingHtml = await generateLandingPage(prompt, buildMemory, project.slug, project.name, project.tagline || undefined);

  await pool.query(
    `UPDATE projects SET landing_page_html = $1, landing_page_published = TRUE WHERE id = $2`,
    [landingHtml, project.id]
  );
  await pool.query(
    `INSERT INTO pages (project_id, slug, title, html, published)
     VALUES ($1, 'index', $2, $3, TRUE)
     ON CONFLICT (project_id, slug) DO UPDATE SET html = $3, published = TRUE, updated_at = NOW()`,
    [project.id, project.name, landingHtml]
  );

  return { step: "landing_page", status: "fixed", message: "Landing page generated" };
}

async function fixGitHubPush(pool: Pool, project: ProjectRow): Promise<FixResult> {
  if (!project.github_repo_full_name) return { step: "github_push", status: "skipped", message: "No repo" };

  // Re-read landing_page_html in case we just generated it
  const htmlResult = await pool.query(
    `SELECT landing_page_html FROM projects WHERE id = $1`,
    [project.id]
  );
  const landingHtml = htmlResult.rows[0]?.landing_page_html as string | null;
  if (!landingHtml) return { step: "github_push", status: "skipped", message: "No landing page to push" };

  if (DRY_RUN) return { step: "github_push", status: "skipped", message: "[DRY RUN] Would push to GitHub" };

  const { pushWebsite } = await import("../src/lib/github");
  const companyEmail = `${project.slug}@${COMPANY_DOMAIN}`;

  const missionDoc = await pool.query(
    `SELECT content FROM documents WHERE project_id = $1 AND type = 'mission' LIMIT 1`,
    [project.id]
  );

  await pushWebsite(project.github_repo_full_name, landingHtml, "", {
    slug: project.slug,
    companyName: project.name,
    domain: `${project.slug}.${COMPANY_DOMAIN}`,
    email: companyEmail,
    missionSummary: (missionDoc.rows[0]?.content as string)?.slice(0, 200) || "",
  });

  return { step: "github_push", status: "fixed", message: `Pushed to ${project.github_repo_full_name}` };
}

async function fixCloudflare(pool: Pool, project: ProjectRow): Promise<FixResult> {
  const status = project.cloudflare_setup_status;
  if (!project.github_repo_full_name) return { step: "cloudflare", status: "skipped", message: "No repo" };
  if (status === "live") return { step: "cloudflare", status: "skipped", message: "Already live" };

  // If cloudflare was never set up, set it up
  if (status === "skipped" || status === "failed" || !status) {
    if (DRY_RUN) return { step: "cloudflare", status: "skipped", message: "[DRY RUN] Would setup Cloudflare" };

    try {
      const { setupCloudflarePages } = await import("../src/lib/cloudflare");
      const githubOrg = process.env.GITHUB_ORG || "artha-companies";
      await setupCloudflarePages(project.slug, githubOrg);
      await pool.query(
        `UPDATE projects SET cloudflare_setup_status = 'configured', cloudflare_setup_error = NULL WHERE id = $1`,
        [project.id]
      );
    } catch (err) {
      // May already exist, continue to deployment check
      const msg = String(err);
      if (!msg.includes("already exists")) {
        return { step: "cloudflare", status: "failed", message: msg };
      }
    }
  }

  // Check deployment
  if (DRY_RUN) return { step: "cloudflare", status: "skipped", message: "[DRY RUN] Would check deployment" };

  const { waitForDeployment } = await import("../src/lib/cloudflare");
  const siteUrl = `https://${project.slug}.${COMPANY_DOMAIN}`;
  const isLive = await waitForDeployment(project.slug, 60_000);

  if (isLive) {
    await pool.query(
      `UPDATE projects SET cloudflare_setup_status = 'live', cloudflare_setup_error = NULL WHERE id = $1`,
      [project.id]
    );
    return { step: "cloudflare", status: "fixed", message: `Live at ${siteUrl}` };
  }

  return { step: "cloudflare", status: "skipped", message: `Deployment in progress at ${siteUrl}` };
}

async function fixTaskQueue(pool: Pool, project: ProjectRow): Promise<FixResult> {
  if (project.task_count > 0) return { step: "task_queue", status: "skipped", message: `${project.task_count} tasks exist` };

  const prompt = project.prompt || (project.memory?.companyDescription as string) || "";
  if (!prompt) return { step: "task_queue", status: "skipped", message: "No prompt available" };

  if (DRY_RUN) return { step: "task_queue", status: "skipped", message: "[DRY RUN] Would generate tasks" };

  const { buildTaskContext } = await import("../src/lib/supermemory");
  const { runTaskGeneratorAgent } = await import("../src/lib/agents/task-generator");

  const taskContext = await buildTaskContext({
    projectId: project.id,
    userId: project.user_id,
    taskDescription: "Generate high-impact revenue-driving tasks for this newly created company",
  });

  const result = await runTaskGeneratorAgent({
    prompt: `Generate 6 high-impact tasks for this newly created company. Prioritize in this order:
1. Tasks that DIRECTLY generate revenue (outreach to paying customers, setting up pricing, lead generation)
2. Tasks that build audience and pipeline (content, social, community posts)
3. Tasks that strengthen positioning (competitor analysis, landing page optimization)

The founder just launched — they need their first dollar FAST. Every task should be specific and executable by an AI agent.`,
    context: taskContext,
    projectId: project.id,
    userId: project.user_id,
    metadata: { count: 6, executionSource: "fix-onboarding" },
  });

  const tasks = result.tasksCreated || [];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    await pool.query(
      `INSERT INTO tasks (project_id, type, title, description, status, priority, prompt, is_recurring, source, tag, agent, revenue_impact)
       VALUES ($1, $2, $3, $4, 'queued', $5, $4, TRUE, 'system', $6, $7, $8)`,
      [project.id, t.type || "custom", t.title, t.description, i + 1, t.tag || null, t.agent || null, t.revenue_impact || null]
    );
  }

  // Ensure project is active with credits
  await pool.query(
    `UPDATE projects SET status = 'active', task_credits = GREATEST(task_credits, 5) WHERE id = $1`,
    [project.id]
  );

  return { step: "task_queue", status: "fixed", message: `${tasks.length} tasks created` };
}

async function fixWelcomeEmail(pool: Pool, project: ProjectRow): Promise<FixResult> {
  if (project.has_welcome_email) return { step: "welcome_email", status: "skipped", message: "Already sent" };

  if (DRY_RUN) return { step: "welcome_email", status: "skipped", message: "[DRY RUN] Would send welcome email" };

  const { sendCompanyWelcome } = await import("../src/lib/postmark");
  const { getCompanyMemory } = await import("../src/lib/neon");

  const userResult = await pool.query(`SELECT email, name FROM users WHERE id = $1`, [project.user_id]);
  const user = userResult.rows[0];
  if (!user?.email) return { step: "welcome_email", status: "skipped", message: "No user email found" };

  const queuedTasks = await pool.query(
    `SELECT title, description FROM tasks WHERE project_id = $1 AND status = 'queued' ORDER BY priority ASC LIMIT 3`,
    [project.id]
  );

  const researchDocs = await pool.query(
    `SELECT content FROM documents WHERE project_id = $1 AND type = 'market_research' ORDER BY created_at DESC LIMIT 1`,
    [project.id]
  );
  const researchSummary = researchDocs.rows.length > 0
    ? (researchDocs.rows[0].content as string).split("\n").filter((l: string) => l.trim()).slice(0, 2).join(" ").slice(0, 300)
    : undefined;

  const projectRow = await pool.query(`SELECT marketplace_enabled, first_tweet_url FROM projects WHERE id = $1`, [project.id]);
  const stripeConnectUrl = await getCompanyMemory(project.id, "stripeConnectUrl");

  await sendCompanyWelcome({
    slug: project.slug,
    companyName: project.name,
    founderEmail: user.email as string,
    founderName: user.name as string | null,
    researchSummary,
    tweetUrl: projectRow.rows[0]?.first_tweet_url as string | undefined,
    tasks: queuedTasks.rows.map((t: Record<string, unknown>) => ({
      title: t.title as string,
      description: (t.description as string)?.slice(0, 80),
    })),
    marketplaceEnabled: projectRow.rows[0]?.marketplace_enabled as boolean || false,
    stripeConnectUrl: stripeConnectUrl as string | undefined,
  });

  return { step: "welcome_email", status: "fixed", message: `Sent to ${user.email}` };
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log(`\n🔧 Artha Onboarding Repair Tool`);
  console.log(`   Mode: ${DRY_RUN ? "DRY RUN (preview only)" : "LIVE (will make changes)"}`);
  console.log(`   Scanning: last ${DAYS_BACK} days\n`);

  let totalFixed = 0;
  let totalFailed = 0;

  try {
    const result = await pool.query(`
      SELECT
        p.id, p.slug, p.name, p.user_id, p.status,
        p.landing_page_html, p.landing_page_published,
        p.github_repo_full_name, p.cloudflare_setup_status,
        p.email_setup_status, p.company_email, p.task_credits,
        p.memory,
        cp.tagline,
        j.payload->>'prompt' as prompt,
        EXISTS(SELECT 1 FROM documents d WHERE d.project_id = p.id AND d.type = 'mission') as has_mission,
        EXISTS(SELECT 1 FROM documents d WHERE d.project_id = p.id AND d.type = 'market_research') as has_research,
        (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) as task_count,
        EXISTS(
          SELECT 1 FROM pipeline_events pe
          JOIN job_queue jj ON jj.id = pe.job_id AND jj.type = 'run_pipeline'
          WHERE pe.project_id = p.id AND pe.step = 'welcome_email' AND pe.status = 'completed'
        ) as has_welcome_email
      FROM projects p
      LEFT JOIN company_profile cp ON cp.project_id = p.id
      LEFT JOIN LATERAL (
        SELECT jq.payload FROM pipeline_events pe2
        JOIN job_queue jq ON jq.id = pe2.job_id AND jq.type = 'run_pipeline'
        WHERE pe2.project_id = p.id
        ORDER BY pe2.created_at DESC LIMIT 1
      ) j ON TRUE
      WHERE p.created_at > NOW() - ($1 || ' days')::interval
      ORDER BY p.created_at DESC
    `, [DAYS_BACK.toString()]);

    const projects = result.rows as ProjectRow[];
    console.log(`Found ${projects.length} projects to check\n`);

    for (const project of projects) {
      // Determine what needs fixing
      const issues: string[] = [];
      if (!project.has_mission) issues.push("mission");
      if (!project.has_research) issues.push("research");
      if (!project.landing_page_html) issues.push("website");
      if (project.github_repo_full_name && !project.landing_page_html) issues.push("github");
      if (project.cloudflare_setup_status !== "live" && project.github_repo_full_name) issues.push("cloudflare");
      if (project.task_count === 0) issues.push("tasks");
      if (!project.has_welcome_email) issues.push("email");

      if (issues.length === 0) continue; // All good, skip

      console.log(`── ${project.name} (${project.slug}) ──`);
      console.log(`   Issues: ${issues.join(", ")}`);

      const results: FixResult[] = [];

      // Run fixes in dependency order
      const steps: Array<[string, () => Promise<FixResult>]> = [
        ["mission", () => fixMission(pool, project)],
        ["market_research", () => fixMarketResearch(pool, project)],
        ["landing_page", () => fixLandingPage(pool, project)],
        ["github_push", () => fixGitHubPush(pool, project)],
        ["cloudflare", () => fixCloudflare(pool, project)],
        ["task_queue", () => fixTaskQueue(pool, project)],
        ["welcome_email", () => fixWelcomeEmail(pool, project)],
      ];

      for (const [stepName, fixFn] of steps) {
        try {
          const r = await fixFn();
          results.push(r);
          const icon = r.status === "fixed" ? "✓" : r.status === "failed" ? "✗" : "·";
          log(project.slug, icon, `${r.step}: ${r.message}`);
          if (r.status === "fixed") totalFixed++;
          if (r.status === "failed") totalFailed++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log(project.slug, "✗", `${stepName}: ${msg}`);
          results.push({ step: stepName, status: "failed", message: msg });
          totalFailed++;
        }
      }

      console.log("");
    }

    console.log(`── Summary ──`);
    console.log(`   Fixed: ${totalFixed}`);
    console.log(`   Failed: ${totalFailed}`);
    if (DRY_RUN) console.log(`   (Dry run — no changes were made)`);
    console.log("");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
