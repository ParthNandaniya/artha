import { neon } from "@neondatabase/serverless";
import "dotenv/config";

const db = neon(process.env.DATABASE_URL!);

const [, , action, identifier] = process.argv;

const USAGE = `
Usage:
  npm run sub:activate <slug|email>     Activate Pro for a project
  npm run sub:deactivate <slug|email>   Revert to free tier
  npm run sub:status <slug|email>       Check subscription status
  npm run sub:credits <slug|email> <n>  Set task credits to n

Examples:
  npm run sub:activate my-startup
  npm run sub:deactivate user@example.com
  npm run sub:credits my-startup 100
`;

async function findProject(identifier: string) {
  const isEmail = identifier.includes("@");

  const rows = isEmail
    ? await db`
        SELECT p.id, p.name, p.slug, p.subscription_status, p.task_credits,
               p.current_period_end, p.user_id, u.email
        FROM projects p
        JOIN users u ON p.user_id = u.id
        WHERE u.email = ${identifier}
        ORDER BY p.created_at DESC
        LIMIT 1
      `
    : await db`
        SELECT p.id, p.name, p.slug, p.subscription_status, p.task_credits,
               p.current_period_end, p.user_id,
               (SELECT email FROM users WHERE id = p.user_id) as email
        FROM projects p
        WHERE p.slug = ${identifier}
        LIMIT 1
      `;

  if (rows.length === 0) {
    console.error(`\n  Project not found for: ${identifier}\n`);
    process.exit(1);
  }

  return rows[0];
}

async function activate(identifier: string) {
  const project = await findProject(identifier);

  if (project.subscription_status === "active") {
    console.log(`\n  Already active: ${project.name} (${project.slug})\n`);
    return;
  }

  const fakeSubId = `manual_pro_${crypto.randomUUID()}`;

  await db`
    UPDATE projects SET
      subscription_status = 'active',
      stripe_subscription_id = ${fakeSubId},
      task_credits = 50,
      current_period_end = NOW() + INTERVAL '30 days'
    WHERE id = ${project.id}
  `;

  await db`
    INSERT INTO subscriptions (id, project_id, user_id, stripe_subscription_id, stripe_customer_id, plan, status, current_period_start, current_period_end, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${project.id}, ${project.user_id},
      ${fakeSubId}, 'manual_customer', 'pro_49', 'active',
      NOW(), NOW() + INTERVAL '30 days', NOW()
    )
  `;

  console.log(`\n  Pro activated for: ${project.name} (${project.slug})`);
  console.log(`  Credits: 50 | Expires: 30 days from now`);
  console.log(`  User: ${project.email}\n`);
}

async function deactivate(identifier: string) {
  const project = await findProject(identifier);

  if (project.subscription_status === "none") {
    console.log(`\n  Already on free tier: ${project.name} (${project.slug})\n`);
    return;
  }

  await db`
    UPDATE projects SET
      subscription_status = 'none',
      stripe_subscription_id = NULL,
      task_credits = 5,
      current_period_end = NULL
    WHERE id = ${project.id}
  `;

  await db`
    UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW()
    WHERE project_id = ${project.id} AND status = 'active'
  `;

  console.log(`\n  Reverted to free: ${project.name} (${project.slug})`);
  console.log(`  Credits: 5\n`);
}

async function status(identifier: string) {
  const project = await findProject(identifier);

  console.log(`
  Project:      ${project.name}
  Slug:         ${project.slug}
  Email:        ${project.email}
  Status:       ${project.subscription_status}
  Credits:      ${project.task_credits}
  Period ends:  ${project.current_period_end || "N/A"}
`);
}

async function setCredits(identifier: string) {
  const credits = Number(process.argv[4]);
  if (isNaN(credits) || credits < 0) {
    console.error("\n  Provide a valid credit number: npm run sub:credits <slug> <number>\n");
    process.exit(1);
  }

  const project = await findProject(identifier);

  await db`UPDATE projects SET task_credits = ${credits} WHERE id = ${project.id}`;

  console.log(`\n  Credits set to ${credits} for: ${project.name} (${project.slug})\n`);
}

async function main() {
  if (!action || !identifier) {
    console.log(USAGE);
    process.exit(0);
  }

  switch (action) {
    case "activate":
      await activate(identifier);
      break;
    case "deactivate":
      await deactivate(identifier);
      break;
    case "status":
      await status(identifier);
      break;
    case "credits":
      await setCredits(identifier);
      break;
    default:
      console.error(`\n  Unknown action: ${action}`);
      console.log(USAGE);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
