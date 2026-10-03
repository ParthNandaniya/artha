import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import {
  sendSubscriptionValueEmail,
  sendSubscriptionUrgencyEmail,
  isTestEmailBlocked,
} from "@/lib/postmark";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  // Target: active projects without a subscription, not broadcast in the last 6 days
  const projects = await db`
    SELECT
      p.id, p.name, p.slug,
      u.email AS user_email, u.name AS user_name,
      p.last_subscription_broadcast_at
    FROM projects p
    JOIN users u ON u.id = p.user_id
    WHERE p.status = 'active'
      AND (p.subscription_status IS NULL OR p.subscription_status NOT IN ('active', 'trialing'))
      AND (p.last_subscription_broadcast_at IS NULL OR p.last_subscription_broadcast_at < NOW() - INTERVAL '6 days')
      AND (p.is_demo IS NULL OR p.is_demo = FALSE)
      AND COALESCE(p.hidden, false) = false
      AND COALESCE(u.hidden, false) = false
  `;

  // Alternate tone each week: even ISO week = value, odd = urgency
  const weekNumber = Math.floor(
    (Date.now() - new Date("2024-01-01").getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  const useValueTone = weekNumber % 2 === 0;

  let sent = 0;
  let skipped = 0;

  for (const project of projects) {
    if (isTestEmailBlocked(project.user_email as string, project.slug as string)) {
      skipped++;
      continue;
    }

    try {
      const emailOptions = {
        slug: project.slug as string,
        companyName: project.name as string,
        toEmail: project.user_email as string,
        toName: project.user_name as string | null,
      };

      if (useValueTone) {
        await sendSubscriptionValueEmail(emailOptions);
      } else {
        await sendSubscriptionUrgencyEmail(emailOptions);
      }

      await db`
        UPDATE projects SET last_subscription_broadcast_at = NOW() WHERE id = ${project.id as string}
      `;

      sent++;
    } catch {
      skipped++;
    }
  }

  return NextResponse.json({ sent, skipped, tone: useValueTone ? "value" : "urgency" });
}
