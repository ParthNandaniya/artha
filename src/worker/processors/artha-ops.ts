import { runOpsHealthAgent } from "@/lib/agents/artha-ops/ops-agent";
import { runAnalyticsBIAgent } from "@/lib/agents/artha-ops/analytics-agent";
import { runSupportAgent } from "@/lib/agents/artha-ops/support-agent";
import { runSalesAgent } from "@/lib/agents/artha-ops/sales-agent";
import { runGrowthAgent } from "@/lib/agents/artha-ops/growth-agent";
import { runCommunityAgent } from "@/lib/agents/artha-ops/community-agent";
import { runProductAgent } from "@/lib/agents/artha-ops/product-agent";

/**
 * Process an artha_ops job from the job queue.
 * This allows ops agents to be enqueued via the worker in addition to cron.
 */
export async function processArthaOpsJob(
  _jobId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const agent = payload.agent as string;

  switch (agent) {
    case "artha_ops":
      await runOpsHealthAgent("manual");
      break;
    case "artha_analytics":
      await runAnalyticsBIAgent((payload.mode as "daily" | "weekly") || "daily");
      break;
    case "artha_support":
      await runSupportAgent("manual");
      break;
    case "artha_sales":
      await runSalesAgent("manual");
      break;
    case "artha_growth":
      await runGrowthAgent("manual");
      break;
    case "artha_community":
      await runCommunityAgent("manual");
      break;
    case "artha_product":
      await runProductAgent("manual");
      break;
    default:
      throw new Error(`Unknown artha ops agent: ${agent}`);
  }
}
