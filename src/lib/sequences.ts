import { getDb } from "./neon";

interface SequenceStep {
  step: number;
  delay_days: number;
  subject_template: string;
  body_template: string;
}

/**
 * Enroll a lead into the default follow-up sequence for a project.
 * No-ops if the lead is already enrolled or no active sequence exists.
 */
export async function enrollLeadInDefaultSequence(
  projectId: string,
  leadId: string
): Promise<boolean> {
  const db = getDb();

  // Find the default (first active) sequence for this project
  const sequences = await db`
    SELECT id, steps FROM email_sequences
    WHERE project_id = ${projectId} AND active = TRUE
    ORDER BY created_at ASC LIMIT 1
  `;
  if (sequences.length === 0) return false;

  const sequence = sequences[0];
  const steps = sequence.steps as SequenceStep[];
  if (!steps || steps.length === 0) return false;

  // Calculate when to send the first follow-up
  const firstStep = steps.find((s) => s.step === 1) || steps[0];
  const nextSendAt = new Date(Date.now() + firstStep.delay_days * 24 * 60 * 60 * 1000).toISOString();

  try {
    await db`
      INSERT INTO sequence_enrollments (project_id, sequence_id, lead_id, current_step, status, next_send_at)
      VALUES (${projectId}, ${sequence.id}, ${leadId}, 1, 'active', ${nextSendAt})
      ON CONFLICT (sequence_id, lead_id) DO NOTHING
    `;
    return true;
  } catch {
    return false;
  }
}

/**
 * Advance an enrollment to the next step after sending.
 */
export async function advanceEnrollmentStep(
  enrollmentId: string,
  sequenceSteps: SequenceStep[]
): Promise<void> {
  const db = getDb();

  const rows = await db`
    SELECT current_step FROM sequence_enrollments WHERE id = ${enrollmentId}
  `;
  if (rows.length === 0) return;

  const currentStep = rows[0].current_step as number;
  const nextStepNum = currentStep + 1;
  const nextStep = sequenceSteps.find((s) => s.step === nextStepNum);

  if (!nextStep) {
    // All steps completed
    await db`
      UPDATE sequence_enrollments
      SET status = 'completed', last_sent_at = NOW()
      WHERE id = ${enrollmentId}
    `;
    return;
  }

  const nextSendAt = new Date(Date.now() + nextStep.delay_days * 24 * 60 * 60 * 1000).toISOString();
  await db`
    UPDATE sequence_enrollments
    SET current_step = ${nextStepNum}, last_sent_at = NOW(), next_send_at = ${nextSendAt}
    WHERE id = ${enrollmentId}
  `;
}

/**
 * Check if a sender email matches any active enrollment and mark it as replied.
 * Returns true if a match was found.
 */
export async function detectSequenceReply(
  projectId: string,
  senderEmail: string
): Promise<boolean> {
  const db = getDb();
  const normalizedEmail = senderEmail.toLowerCase();

  // Find any active enrollment where the lead's email matches the sender
  const matches = await db`
    UPDATE sequence_enrollments se
    SET status = 'replied'
    FROM leads l
    WHERE se.lead_id = l.id
      AND se.project_id = ${projectId}
      AND se.status = 'active'
      AND LOWER(l.email) = ${normalizedEmail}
    RETURNING se.id
  `;

  if (matches.length > 0) {
    // Also update lead status
    await db`
      UPDATE leads
      SET status = 'replied', updated_at = NOW()
      WHERE project_id = ${projectId}
        AND LOWER(email) = ${normalizedEmail}
        AND status = 'contacted'
    `;
    return true;
  }

  return false;
}

/**
 * Get the current step template for an enrollment.
 */
export function getStepTemplate(
  steps: SequenceStep[],
  currentStep: number
): SequenceStep | null {
  return steps.find((s) => s.step === currentStep) || null;
}
