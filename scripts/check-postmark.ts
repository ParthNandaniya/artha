import { existsSync, readFileSync } from "fs";
import { join } from "path";

type PostmarkCheckReport = {
  ok: boolean;
  issues: string[];
  warnings: string[];
};

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

function printReport(title: string, report: PostmarkCheckReport) {
  console.log(`\n${title}`);
  console.log(report.ok ? "✅ Ready" : "❌ Not ready");

  if (report.issues.length > 0) {
    console.log("Issues:");
    for (const issue of report.issues) {
      console.log(`  - ${issue}`);
    }
  }

  if (report.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of report.warnings) {
      console.log(`  - ${warning}`);
    }
  }
}

async function main() {
  loadEnv();
  const {
    getDisplayCompanyInboundWebhookUrl,
    getPostmarkSetupReport,
  } = await import("../src/lib/postmark");

  console.log("Artha Postmark check");
  console.log(`Expected shared inbound webhook: ${getDisplayCompanyInboundWebhookUrl()}`);

  const [platform, company] = await Promise.all([
    getPostmarkSetupReport("platform"),
    getPostmarkSetupReport("company"),
  ]);

  printReport("Platform mail (agents@artha.run)", platform);
  printReport("Company mail ({slug}@tryartha.com)", company);
}

void main();
