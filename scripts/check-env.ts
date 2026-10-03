import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getSelectedTwitterEnv } from "../src/lib/twitter";

function loadEnv() {
  const envFiles = [".env.local", ".env"];

  for (const envFile of envFiles) {
    const envPath = join(process.cwd(), envFile);
    if (!existsSync(envPath)) continue;
    const envContent = readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const [key, ...valueParts] = trimmed.split("=");
      if (!key || valueParts.length === 0 || process.env[key]) return;
      process.env[key] = valueParts.join("=").trim();
    });
  }
}

function missing(keys: string[]) {
  return keys.filter((key) => !isConfiguredValue(process.env[key]));
}

function hasValue(key: string) {
  return isConfiguredValue(process.env[key]);
}

function isConfiguredValue(value?: string) {
  const normalized = value?.trim();
  return Boolean(normalized && normalized !== "...");
}

function printSection(name: string, missingKeys: string[]) {
  if (missingKeys.length === 0) {
    console.log(`✅ ${name}: all set`);
    return;
  }

  console.log(`❌ ${name}: missing ${missingKeys.length}`);
  for (const key of missingKeys) {
    console.log(`   - ${key}`);
  }
}

async function main() {
  loadEnv();

  const coreRequired = [
    "DATABASE_URL",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_APP_DOMAIN",
    "NEXT_PUBLIC_COMPANY_DOMAIN",
  ];

  const automationRequired = [
    "NEON_API_KEY",
    "NEON_ORG_ID",
  ];

  const stripeCommonRequired: string[] = [];

  const useTestKeys = process.env.STRIPE_USE_TEST_KEYS === "true";
  const stripeKeyRequired = useTestKeys
    ? [
        "STRIPE_SECRET_KEY_TEST",
        "STRIPE_WEBHOOK_SECRET_TEST",
      ]
    : [
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
      ];

  console.log("Artha env check\n");
  printSection("Core web app + login + AI", missing(coreRequired));
  printSection("Onboarding automation (Neon)", missing(automationRequired));
  printSection(
    `Stripe checkout (${useTestKeys ? "test mode" : "live mode"})`,
    missing([...stripeCommonRequired, ...stripeKeyRequired])
  );

  console.log("\nOptional integrations");
  printSection("Exa semantic search", missing(["EXA_API_KEY"]));
  printSection("Brave keyword search", missing(["BRAVE_SEARCH_API_KEY"]));
  const isProduction = process.env.NODE_ENV === "production";
  const tavilyKey = isProduction ? "TAVILY_API_KEY_PROD" : "TAVILY_API_KEY_DEV";
  const hasTavily = (process.env[tavilyKey]?.trim() || process.env.TAVILY_API_KEY?.trim()) ?? "";
  printSection(
    `Tavily hybrid search (fallback) — ${isProduction ? "prod" : "dev"} key`,
    hasTavily ? [] : [tavilyKey]
  );
  printSection("Memory (Supermemory)", missing(["SUPERMEMORY_API_KEY"]));
  printSection("GitHub automation", missing(["GITHUB_TOKEN", "GITHUB_ORG"]));
  printSection(
    "Cloudflare Pages deployment",
    missing(["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"])
  );
  printSection(
    `Twitter platform posting (${process.env.NODE_ENV === "production" ? "prod" : "dev"})`,
    missing([
      getSelectedTwitterEnv().names.clientId,
      getSelectedTwitterEnv().names.clientSecret,
      getSelectedTwitterEnv().names.refreshToken,
    ])
  );
  printSection("Postmark platform mail (agents@artha.run)", (
    hasValue("POSTMARK_PLATFORM_SERVER_TOKEN") || hasValue("POSTMARK_SERVER_TOKEN")
  ) ? [] : ["POSTMARK_PLATFORM_SERVER_TOKEN or POSTMARK_SERVER_TOKEN"]);
  printSection("Postmark company mail ({slug}@tryartha.com)", (
    hasValue("POSTMARK_COMPANY_SERVER_TOKEN") || hasValue("POSTMARK_SERVER_TOKEN")
  ) ? [] : ["POSTMARK_COMPANY_SERVER_TOKEN or POSTMARK_SERVER_TOKEN"]);
  printSection(
    "Postmark inbound webhook",
    missing(["POSTMARK_INBOUND_WEBHOOK_SECRET"])
  );
  printSection(
    "Postmark account diagnostics (recommended)",
    missing(["POSTMARK_ACCOUNT_TOKEN", "POSTMARK_PLATFORM_SERVER_ID", "POSTMARK_COMPANY_SERVER_ID"])
  );
  printSection("Cron protection", missing(["CRON_SECRET"]));
}

void main();
