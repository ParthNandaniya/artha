import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import { generateAgentCompletion } from "@/lib/ai/agent-model-router";
import { sendCompanyColdEmail } from "@/lib/postmark";
import { decrementProjectCredits, getProjectCredits } from "@/lib/project-credits";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  const canceledSubscribers = await db`
    SELECT ms.*, p.slug, p.name AS project_name, p.id AS project_id
    FROM marketplace_subscribers ms
    JOIN projects p ON p.id = ms.project_id
    WHERE ms.status = 'canceled'
      AND ms.canceled_at > NOW() - interval '7 days'
  `;

  let churned = 0;
  let winbacksSent = 0;

  for (const subscriber of canceledSubscribers) {
    churned++;
    const projectId = subscriber.project_id as string;
    const subscriberId = subscriber.id as string;
    const slug = subscriber.slug as string;
    const companyName = subscriber.project_name as string;

    // Check if winback already sent
    const existing = await db`
      SELECT id FROM churn_events
      WHERE subscriber_id = ${subscriberId} AND event_type = 'winback_sent'
      LIMIT 1
    `;
    if (existing.length > 0) continue;

    // Check credits
    const projectRows = await db`SELECT * FROM projects WHERE id = ${projectId}`;
    if (projectRows.length === 0) continue;
    const credits = getProjectCredits(projectRows[0] as Record<string, unknown>);
    const emailWriterCost = 0.5;
    if (credits < emailWriterCost) continue;

    try {
      const subscriberEmail = subscriber.email as string;
      const subscriberName = (subscriber.name as string) || null;

      // Generate winback email
      const systemPrompt = `You are an email writer for ${companyName}. Write a warm, empathetic winback email to a customer who recently canceled their subscription. Be genuine, not pushy. Acknowledge their decision and offer value. Return only the email body HTML.`;
      const userPrompt = `Customer name: ${subscriberName || "there"}
Customer email: ${subscriberEmail}
Company: ${companyName}

Write a winback email that:
1. Acknowledges their cancellation respectfully
2. Asks for brief feedback on why they left
3. Mentions any recent improvements or upcoming features
4. Offers to help if they had issues

Return only the HTML body.`;

      const bodyHtml = await generateAgentCompletion("email_writer", systemPrompt, userPrompt);

      await sendCompanyColdEmail({
        slug,
        companyName,
        toEmail: subscriberEmail,
        toName: subscriberName,
        subject: `We're sorry to see you go, ${subscriberName || "friend"}`,
        bodyHtml,
      });

      // Record churn event
      await db`
        INSERT INTO churn_events (subscriber_id, project_id, event_type)
        VALUES (${subscriberId}, ${projectId}, 'winback_sent')
      `;

      // Charge credits
      await decrementProjectCredits(db, projectId, emailWriterCost);
      winbacksSent++;
    } catch (error) {
      console.error(`Winback email failed for subscriber ${subscriberId}:`, error);
    }
  }

  return NextResponse.json({ churned, winbacksSent });
}
