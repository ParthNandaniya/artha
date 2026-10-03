import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import { generateAgentCompletion } from "@/lib/ai/agent-model-router";
import { sendCompanyColdEmail } from "@/lib/postmark";
import { FOLLOWUP_GENERATION_COST, OUTBOUND_EMAIL_COST } from "@/config/credit-costs";
import { decrementProjectCredits, getProjectCredits } from "@/lib/project-credits";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  const enrollments = await db`
    SELECT se.*, p.slug, p.name AS project_name, p.id AS project_id
    FROM sequence_enrollments se
    JOIN projects p ON p.id = se.project_id
    JOIN users u ON u.id = p.user_id
    WHERE se.status = 'active' AND se.next_send_at <= NOW()
      AND COALESCE(p.hidden, false) = false
      AND COALESCE(u.hidden, false) = false
  `;

  let processed = 0;
  let sent = 0;
  let replied = 0;
  let skipped = 0;

  for (const enrollment of enrollments) {
    processed++;
    const projectId = enrollment.project_id as string;
    const slug = enrollment.slug as string;
    const companyName = enrollment.project_name as string;

    // Load the lead
    const leads = await db`
      SELECT * FROM leads WHERE id = ${enrollment.lead_id}
    `;
    if (leads.length === 0) {
      skipped++;
      continue;
    }
    const lead = leads[0];
    const leadEmail = lead.email as string;

    // Check if lead replied
    const replies = await db`
      SELECT id FROM email_inbound
      WHERE from_email = ${leadEmail}
      LIMIT 1
    `;
    if (replies.length > 0) {
      await db`
        UPDATE sequence_enrollments SET status = 'replied' WHERE id = ${enrollment.id}
      `;
      replied++;
      continue;
    }

    // Check credits
    const projectRows = await db`SELECT * FROM projects WHERE id = ${projectId}`;
    if (projectRows.length === 0) { skipped++; continue; }
    const credits = getProjectCredits(projectRows[0] as Record<string, unknown>);
    const totalCost = FOLLOWUP_GENERATION_COST + OUTBOUND_EMAIL_COST;
    if (credits < totalCost) { skipped++; continue; }

    // Load the sequence and get current step
    const sequences = await db`
      SELECT * FROM email_sequences WHERE id = ${enrollment.sequence_id}
    `;
    if (sequences.length === 0) { skipped++; continue; }
    const sequence = sequences[0];
    const steps = sequence.steps as Array<{ subject: string; body: string; delay_days: number }>;
    const currentStep = enrollment.current_step as number;

    if (currentStep >= steps.length) {
      await db`
        UPDATE sequence_enrollments SET status = 'completed' WHERE id = ${enrollment.id}
      `;
      continue;
    }

    const step = steps[currentStep];

    // Generate personalized follow-up
    const systemPrompt = `You are an email writer for ${companyName}. Write a personalized follow-up email based on the template provided. Keep the tone professional but warm. Return only the email body HTML.`;
    const userPrompt = `Lead name: ${lead.name || "there"}
Lead email: ${leadEmail}
Lead company: ${lead.company || "unknown"}
Lead title: ${lead.title || "unknown"}

Step ${currentStep + 1} template:
Subject: ${step.subject}
Body: ${step.body}

Personalize this follow-up email for the lead. Return only the HTML body.`;

    try {
      const bodyHtml = await generateAgentCompletion("email_writer", systemPrompt, userPrompt);

      await sendCompanyColdEmail({
        slug,
        companyName,
        toEmail: leadEmail,
        toName: (lead.name as string) || null,
        subject: step.subject,
        bodyHtml,
      });

      // Charge credits
      await decrementProjectCredits(db, projectId, totalCost);

      // Advance step
      const nextStep = currentStep + 1;
      if (nextStep >= steps.length) {
        await db`
          UPDATE sequence_enrollments
          SET current_step = ${nextStep}, last_sent_at = NOW(), status = 'completed'
          WHERE id = ${enrollment.id}
        `;
      } else {
        const nextDelayDays = steps[nextStep].delay_days || 1;
        await db`
          UPDATE sequence_enrollments
          SET current_step = ${nextStep},
              last_sent_at = NOW(),
              next_send_at = NOW() + ${nextDelayDays + " days"}::interval
          WHERE id = ${enrollment.id}
        `;
      }

      sent++;
    } catch (error) {
      console.error(`Failed to send follow-up for enrollment ${enrollment.id}:`, error);
      skipped++;
    }
  }

  return NextResponse.json({ processed, sent, replied, skipped });
}
