import { getDb } from "@/lib/neon";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { runOpsAgent } from "./runner";
import type { OpsAction } from "./types";

interface MilestoneCheck {
  userId: string;
  userName: string | null;
  projectName: string;
  milestoneType: string;
  value: number;
}

async function getNewMilestones(): Promise<MilestoneCheck[]> {
  const db = getDb();
  const milestones: MilestoneCheck[] = [];

  // First sale milestones
  const firstSales = await db`
    SELECT DISTINCT ON (p.id) u.id AS user_id, u.name AS user_name, p.name AS project_name,
           rt.amount_cents
    FROM revenue_transactions rt
    JOIN projects p ON p.id = rt.project_id
    JOIN users u ON u.id = p.user_id
    WHERE rt.type = 'income' AND rt.status = 'completed'
      AND rt.created_at >= NOW() - INTERVAL '1 hour'
      AND NOT EXISTS (
        SELECT 1 FROM milestones m WHERE m.project_id = p.id AND m.type = 'first_sale'
      )
    ORDER BY p.id, rt.created_at ASC
  `;

  for (const row of firstSales) {
    milestones.push({
      userId: row.user_id as string,
      userName: row.user_name as string | null,
      projectName: row.project_name as string,
      milestoneType: "first_sale",
      value: (row.amount_cents as number) / 100,
    });
  }

  // 10th subscriber milestone
  const tenSubs = await db`
    SELECT p.id AS project_id, u.id AS user_id, u.name AS user_name, p.name AS project_name,
           COUNT(ms.id)::int AS sub_count
    FROM marketplace_subscribers ms
    JOIN projects p ON p.id = ms.project_id
    JOIN users u ON u.id = p.user_id
    WHERE ms.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM milestones m WHERE m.project_id = p.id AND m.type = 'subscriber_10'
      )
    GROUP BY p.id, u.id, u.name, p.name
    HAVING COUNT(ms.id) >= 10
  `;

  for (const row of tenSubs) {
    milestones.push({
      userId: row.user_id as string,
      userName: row.user_name as string | null,
      projectName: row.project_name as string,
      milestoneType: "subscriber_10",
      value: row.sub_count as number,
    });
  }

  return milestones;
}

export async function runCommunityAgent(trigger: "cron" | "manual" = "cron") {
  return runOpsAgent("artha_community", trigger, null, async () => {
    const milestones = await getNewMilestones();
    const actions: OpsAction[] = [];

    // Nothing to do
    if (milestones.length === 0) {
      return {
        success: true,
        agent: "artha_community" as const,
        summary: "No new milestones or mentions to process",
        actions: [],
        tokensUsed: { input: 0, output: 0 },
      };
    }

    // Generate celebration tweets and notifications
    const celebrations = await generateAgentJSON<{
      celebrations: { milestoneType: string; tweet: string; notification: string }[];
    }>(
      "artha_community",
      `You are the community manager for Artha (artha.run), an AI company builder.
Generate celebration content for user milestones.

For each milestone:
- Create a congratulatory tweet (under 280 chars). Be enthusiastic but genuine.
  - Don't mention the user by name unless they have a public profile
  - Use the company/project name instead
  - Keep it encouraging for the broader community
- Create a short notification message for the user

Return JSON: { celebrations: [{ milestoneType, tweet, notification }] }`,
      `Milestones to celebrate:\n${milestones.map((m) => `- ${m.projectName}: ${m.milestoneType} (value: ${m.value})`).join("\n")}`,
      { maxTokens: 1000 },
    );

    const db = getDb();
    for (let i = 0; i < milestones.length; i++) {
      const milestone = milestones[i];
      const celebration = (celebrations.celebrations || [])[i];

      if (celebration) {
        actions.push({
          type: "tweet_draft",
          payload: {
            content: celebration.tweet,
            tweetType: "milestone",
            milestoneType: milestone.milestoneType,
            projectName: milestone.projectName,
          },
          requiresApproval: true,
        });
      }

      // Record the milestone so we don't celebrate twice
      try {
        await db`
          INSERT INTO milestones (project_id, type, title, amount_cents)
          SELECT p.id, ${milestone.milestoneType}, ${`${milestone.projectName} — ${milestone.milestoneType}`}, ${Math.round(milestone.value * 100)}
          FROM projects p
          JOIN users u ON u.id = p.user_id
          WHERE u.id = ${milestone.userId} AND p.name = ${milestone.projectName}
          ON CONFLICT (project_id, type) DO NOTHING
        `;
      } catch {
        // Non-fatal — milestone already recorded
      }
    }

    return {
      success: true,
      agent: "artha_community" as const,
      summary: `Community: ${milestones.length} milestones celebrated`,
      actions,
      tokensUsed: { input: 1000, output: 500 },
    };
  });
}
