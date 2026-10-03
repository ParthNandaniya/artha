import type { AgentInput, AgentOutput } from "./types";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import {
  syncProjectPricingPlans,
  ensureUserConnectAccount,
  createConnectManagementLink,
  getSubscribersByProject,
  getSubscriberSummary,
  type GeneratedPricingPlan,
} from "@/lib/marketplace";
import { getDb } from "@/lib/neon";

type StripeAction = "setup_pricing" | "update_pricing" | "connect_status" | "view_revenue" | "view_subscribers";

function classifyStripeAction(prompt: string): StripeAction {
  const lower = prompt.toLowerCase();
  if (lower.includes("subscriber") || lower.includes("customer") || lower.includes("who bought") || lower.includes("customer list") || lower.includes("who signed up")) return "view_subscribers";
  if (lower.includes("revenue") || lower.includes("earnings") || lower.includes("payout") || lower.includes("balance")) return "view_revenue";
  if (lower.includes("connect") || lower.includes("bank") || lower.includes("onboard") || lower.includes("stripe account")) return "connect_status";
  if (lower.includes("update") || lower.includes("change") || lower.includes("modify") || lower.includes("edit")) return "update_pricing";
  return "setup_pricing";
}

async function getExistingPlans(projectId: string) {
  const db = getDb();
  const rows = await db`
    SELECT name, amount_cents, currency, billing_interval, features, active
    FROM project_pricing_plans
    WHERE project_id = ${projectId} AND active = TRUE
    ORDER BY sort_order ASC
  `;
  return rows;
}

async function getRevenueInfo(projectId: string) {
  const db = getDb();
  const project = await db`
    SELECT revenue_balance_cents, marketplace_enabled, marketplace_fee_percent
    FROM projects WHERE id = ${projectId} LIMIT 1
  `;
  const transactions = await db`
    SELECT COUNT(*) as count, COALESCE(SUM(gross_amount_cents), 0) as total_gross,
           COALESCE(SUM(seller_net_amount_cents), 0) as total_net
    FROM revenue_transactions
    WHERE project_id = ${projectId} AND type = 'income'
  `;
  return { project: project[0], transactions: transactions[0] };
}

export async function runStripeAgent(input: AgentInput): Promise<AgentOutput> {
  const action = classifyStripeAction(input.prompt);

  try {
    const progress = input.onProgress || (() => {});
    switch (action) {
      case "view_revenue": {
        progress("Fetching revenue data...");
        const { project, transactions } = await getRevenueInfo(input.projectId);
        const balanceCents = Number(project?.revenue_balance_cents || 0);
        const totalGross = Number(transactions?.total_gross || 0);
        const totalNet = Number(transactions?.total_net || 0);
        const txCount = Number(transactions?.count || 0);

        return {
          success: true,
          agent: "stripe_agent",
          summary: txCount > 0
            ? `Revenue: $${(balanceCents / 100).toFixed(2)} available balance. ${txCount} transactions totaling $${(totalGross / 100).toFixed(2)} gross ($${(totalNet / 100).toFixed(2)} after platform fee).`
            : "No revenue yet. Set up pricing on your website to start earning.",
          links: [{ label: "Stripe Dashboard", url: "#revenue" }],
        };
      }

      case "connect_status": {
        progress("Checking Stripe configuration...");
        try {
          const result = await createConnectManagementLink(input.userId);
          return {
            success: true,
            agent: "stripe_agent",
            summary: result.onboardingComplete
              ? "Your Stripe account is fully set up. You can manage payouts from the Stripe dashboard."
              : "Your Stripe account needs bank details. Complete onboarding to receive payouts.",
            links: [{ label: result.onboardingComplete ? "Stripe Dashboard" : "Complete Setup", url: result.url }],
          };
        } catch (err) {
          return {
            success: false,
            agent: "stripe_agent",
            summary: "Failed to check Stripe account status.",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      case "update_pricing":
      case "setup_pricing": {
        progress("Setting up pricing plans...");
        // Check existing plans for context
        const existingPlans = await getExistingPlans(input.projectId);
        const hasExisting = existingPlans.length > 0;
        const existingContext = hasExisting
          ? `\n\nCurrent active pricing plans:\n${existingPlans.map((p) => `- ${p.name}: $${(Number(p.amount_cents) / 100).toFixed(2)}/${p.billing_interval} (features: ${JSON.stringify(p.features)})`).join("\n")}`
          : "";

        // Ensure Connect account exists (non-fatal if Connect not enabled)
        const connectId = await ensureUserConnectAccount(input.userId);

        // AI generates pricing plans
        const result = await generateAgentJSON<{
          plans: GeneratedPricingPlan[];
          strategy: string;
        }>(
          "stripe_agent",
          `You are a pricing strategist for startups. Based on the company context and user request, design pricing plans that maximize revenue.

Rules:
- Generate 2-4 pricing tiers (e.g., Starter, Pro, Enterprise)
- Each plan must have: name, price (e.g. "$29"), period (e.g. "month", "year", "one-time"), features (array of 3-6 bullet points), ctaText (button label)
- Free tiers should be excluded (we only handle paid plans through Stripe)
- If the user asks to update existing plans, modify them accordingly
- Price should be a string like "$29" or "$99" — not cents
- For the strategy field: explain WHY these tiers make sense for this company (2-3 sentences)

Return JSON: { plans: [{ name, price, period, features, ctaText }], strategy: string }
${existingContext}

Company Context:
${input.context}`,
          input.prompt
        );

        if (!result.plans?.length) {
          return {
            success: false,
            agent: "stripe_agent",
            summary: "Could not generate pricing plans from the request. Try being more specific about what tiers and prices you want.",
            error: "no_plans_generated",
          };
        }

        // Sync plans to Stripe + DB
        progress("Syncing plans to Stripe...");
        const syncedPlans = await syncProjectPricingPlans({
          projectId: input.projectId,
          userId: input.userId,
          plans: result.plans,
        });

        const planSummary = syncedPlans
          .map((p) => `${p.name}: $${(p.amountCents / 100).toFixed(2)}/${p.billingInterval}`)
          .join(", ");

        return {
          success: true,
          agent: "stripe_agent",
          summary: hasExisting
            ? `Updated pricing: ${planSummary}. Strategy: ${result.strategy}`
            : `Set up ${syncedPlans.length} pricing plans: ${planSummary}. Strategy: ${result.strategy}`,
          links: syncedPlans.map((p) => ({
            label: `${p.name} checkout`,
            url: p.checkoutUrl,
          })),
          memoryUpdates: [
            { key: "pricingEnabled", value: true },
            { key: "pricingPlans", value: syncedPlans.map((p) => ({ name: p.name, amount: p.amountCents, interval: p.billingInterval })) },
            { key: "pricingStrategy", value: result.strategy },
          ],
          supermemoryIngestions: [
            {
              content: `Pricing plans configured: ${planSummary}. Strategy: ${result.strategy}`,
              customId: `stripe_pricing_${input.projectId}`,
              dedupeKey: `stripe_pricing_${input.projectId}`,
              metadata: { type: "pricing_setup" },
            },
          ],
          tasksCreated: [
            ...(hasExisting
              ? []
              : [
                  {
                    title: "Complete Stripe account setup",
                    description: "Add your bank details to receive payouts from customer payments. Visit the Stripe Connect link in your dashboard.",
                    type: "custom" as const,
                    tag: "engineering" as const,
                    agent: "stripe_agent" as const,
                  },
                  {
                    title: "Add pricing section to website",
                    description: "Your pricing plans are ready. Ask me to rebuild your website to include the pricing section with live checkout buttons.",
                    type: "custom" as const,
                    tag: "engineering" as const,
                    agent: "stripe_agent" as const,
                  },
                ]),
          ],
        };
      }

      case "view_subscribers": {
        progress("Loading subscriber data...");
        const [subscribers, summary] = await Promise.all([
          getSubscribersByProject(input.projectId),
          getSubscriberSummary(input.projectId),
        ]);

        if (!summary.hasSubscribers) {
          return {
            success: true,
            agent: "stripe_agent",
            summary: "No subscribers yet. Set up pricing on your website and share it to get your first customers.",
            links: [{ label: "Dashboard", url: "#overview" }],
          };
        }

        const recentList = subscribers.slice(0, 5).map((s) => {
          const amount = s.amount_cents ? `$${(Number(s.amount_cents) / 100).toFixed(2)}` : "N/A";
          const interval = s.billing_interval || "one-time";
          return `- ${s.email}${s.name ? ` (${s.name})` : ""}: ${s.plan_name || "Unknown plan"} — ${amount}/${interval} [${s.status}]`;
        }).join("\n");

        const mrrDisplay = `$${(summary.mrrCents / 100).toFixed(2)}`;

        return {
          success: true,
          agent: "stripe_agent",
          summary: [
            `${summary.activeCount} active subscriber${summary.activeCount !== 1 ? "s" : ""}, ${summary.canceledCount} canceled. MRR: ${mrrDisplay}.`,
            summary.newLast7Days > 0 ? `${summary.newLast7Days} new in the last 7 days.` : "",
            `\nRecent subscribers:\n${recentList}`,
            subscribers.length > 5 ? `\n...and ${subscribers.length - 5} more.` : "",
          ].filter(Boolean).join(" "),
          links: [{ label: "View All Subscribers", url: "#revenue" }],
        };
      }

      default:
        return {
          success: false,
          agent: "stripe_agent",
          summary: "Could not determine what Stripe action to take.",
          error: "unknown_action",
        };
    }
  } catch (error) {
    return {
      success: false,
      agent: "stripe_agent",
      summary: `Stripe setup failed: ${error instanceof Error ? error.message : String(error)}`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
