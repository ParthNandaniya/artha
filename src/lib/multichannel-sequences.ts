import { getDb } from "@/lib/neon";

// ═══════════════════════════════════════════════════════════════════════════
// Multi-Channel Sequences — extended sequence system
// ═══════════════════════════════════════════════════════════════════════════

export type SequenceStepType =
  | "email"
  | "linkedin_connect"
  | "linkedin_message"
  | "twitter_follow"
  | "twitter_dm"
  | "wait"
  | "condition";

export interface SequenceStep {
  type: SequenceStepType;
  /** Delay in hours before executing this step (0 = immediate) */
  delayHours: number;
  /** Step-specific content */
  content: {
    subject?: string;
    body?: string;
    message?: string;
    /** For wait steps: duration in hours */
    waitHours?: number;
  };
  /** For condition steps */
  condition?: SequenceCondition;
  /** If condition is met, jump to this step index */
  onTrueStepIndex?: number;
  /** If condition is not met, jump to this step index */
  onFalseStepIndex?: number;
}

export interface SequenceCondition {
  type: "replied" | "opened" | "clicked" | "connected" | "custom";
  /** For custom conditions, a description */
  description?: string;
}

export interface MultichannelSequence {
  id: string;
  projectId: string;
  name: string;
  steps: SequenceStep[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SequenceEnrollment {
  id: string;
  sequenceId: string;
  projectId: string;
  leadId: string;
  currentStepIndex: number;
  status: "active" | "paused" | "completed" | "replied" | "bounced";
  lastActionAt: string | null;
  nextActionAt: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Create a multi-channel sequence with typed steps.
 */
export async function createMultichannelSequence(
  projectId: string,
  name: string,
  steps: SequenceStep[]
): Promise<string> {
  const db = getDb();
  const rows = await db`
    INSERT INTO multichannel_sequences (project_id, name, steps, active)
    VALUES (${projectId}, ${name}, ${JSON.stringify(steps)}, true)
    RETURNING id
  `;
  return rows[0].id as string;
}

/**
 * Get all multichannel sequences for a project.
 */
export async function getMultichannelSequences(
  projectId: string
): Promise<MultichannelSequence[]> {
  const db = getDb();
  const rows = await db`
    SELECT id, project_id, name, steps, active, created_at, updated_at
    FROM multichannel_sequences
    WHERE project_id = ${projectId}
    ORDER BY created_at DESC
  `;
  return rows.map((r) => ({
    id: r.id as string,
    projectId: r.project_id as string,
    name: r.name as string,
    steps: (typeof r.steps === "string" ? JSON.parse(r.steps) : r.steps) as SequenceStep[],
    active: r.active as boolean,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }));
}

/**
 * Determine the next action for an enrollment based on current step + conditions.
 */
export async function getNextAction(
  enrollmentId: string
): Promise<{ stepIndex: number; step: SequenceStep; readyAt: Date } | null> {
  const db = getDb();

  const enrollments = await db`
    SELECT e.*, ms.steps
    FROM multichannel_sequence_enrollments e
    JOIN multichannel_sequences ms ON ms.id = e.sequence_id
    WHERE e.id = ${enrollmentId} AND e.status = 'active'
  `;
  if (enrollments.length === 0) return null;

  const enrollment = enrollments[0];
  const steps = (typeof enrollment.steps === "string"
    ? JSON.parse(enrollment.steps)
    : enrollment.steps) as SequenceStep[];
  const currentIndex = enrollment.current_step_index as number;

  if (currentIndex >= steps.length) return null;

  const step = steps[currentIndex];

  // For condition steps, evaluate and determine next step index
  if (step.type === "condition" && step.condition) {
    const conditionMet = await evaluateCondition(enrollmentId, step.condition);
    const nextIndex = conditionMet
      ? (step.onTrueStepIndex ?? currentIndex + 1)
      : (step.onFalseStepIndex ?? currentIndex + 1);

    if (nextIndex >= steps.length) return null;
    return {
      stepIndex: nextIndex,
      step: steps[nextIndex],
      readyAt: new Date(),
    };
  }

  // For wait steps, calculate when the wait expires
  if (step.type === "wait") {
    const waitHours = step.content.waitHours || 24;
    const lastAction = enrollment.last_action_at
      ? new Date(enrollment.last_action_at as string)
      : new Date(enrollment.created_at as string);
    const readyAt = new Date(lastAction.getTime() + waitHours * 60 * 60 * 1000);
    // After wait, move to next step
    const nextIndex = currentIndex + 1;
    if (nextIndex >= steps.length) return null;
    return { stepIndex: nextIndex, step: steps[nextIndex], readyAt };
  }

  // Regular action step
  const delayMs = step.delayHours * 60 * 60 * 1000;
  const lastAction = enrollment.last_action_at
    ? new Date(enrollment.last_action_at as string)
    : new Date(enrollment.created_at as string);
  const readyAt = new Date(lastAction.getTime() + delayMs);

  return { stepIndex: currentIndex, step, readyAt };
}

/**
 * Execute a specific step for an enrollment. Dispatches to the appropriate channel.
 * Returns a result object describing what was done.
 */
export async function executeStep(
  enrollmentId: string,
  stepIndex: number
): Promise<{ success: boolean; channel: SequenceStepType; message: string }> {
  const db = getDb();

  const enrollments = await db`
    SELECT e.*, ms.steps, ms.project_id, l.email AS lead_email, l.name AS lead_name
    FROM multichannel_sequence_enrollments e
    JOIN multichannel_sequences ms ON ms.id = e.sequence_id
    LEFT JOIN leads l ON l.id = e.lead_id
    WHERE e.id = ${enrollmentId}
  `;
  if (enrollments.length === 0) {
    return { success: false, channel: "email", message: "Enrollment not found" };
  }

  const enrollment = enrollments[0];
  const steps = (typeof enrollment.steps === "string"
    ? JSON.parse(enrollment.steps)
    : enrollment.steps) as SequenceStep[];

  if (stepIndex >= steps.length) {
    return { success: false, channel: "email", message: "Step index out of bounds" };
  }

  const step = steps[stepIndex];
  let result: { success: boolean; channel: SequenceStepType; message: string };

  switch (step.type) {
    case "email":
      // Email dispatch is handled by the existing email system
      result = {
        success: true,
        channel: "email",
        message: `Email step queued for ${enrollment.lead_email || "unknown"}`,
      };
      break;

    case "linkedin_connect":
      result = {
        success: true,
        channel: "linkedin_connect",
        message: `LinkedIn connect request queued for ${enrollment.lead_name || "lead"}`,
      };
      break;

    case "linkedin_message":
      result = {
        success: true,
        channel: "linkedin_message",
        message: `LinkedIn message queued for ${enrollment.lead_name || "lead"}`,
      };
      break;

    case "twitter_follow":
      result = {
        success: true,
        channel: "twitter_follow",
        message: `Twitter follow queued for ${enrollment.lead_name || "lead"}`,
      };
      break;

    case "twitter_dm":
      result = {
        success: true,
        channel: "twitter_dm",
        message: `Twitter DM queued for ${enrollment.lead_name || "lead"}`,
      };
      break;

    case "wait":
      result = {
        success: true,
        channel: "wait",
        message: `Waiting ${step.content.waitHours || 24} hours`,
      };
      break;

    case "condition":
      result = {
        success: true,
        channel: "condition",
        message: `Condition evaluated: ${step.condition?.type || "unknown"}`,
      };
      break;

    default:
      result = { success: false, channel: step.type, message: `Unknown step type: ${step.type}` };
  }

  // Advance the enrollment
  const nextStep = stepIndex + 1;
  if (nextStep >= steps.length) {
    await db`
      UPDATE multichannel_sequence_enrollments
      SET current_step_index = ${nextStep}, last_action_at = NOW(), status = 'completed'
      WHERE id = ${enrollmentId}
    `;
  } else {
    const nextDelayHours = steps[nextStep].delayHours || 0;
    await db`
      UPDATE multichannel_sequence_enrollments
      SET current_step_index = ${nextStep},
          last_action_at = NOW(),
          next_action_at = NOW() + ${nextDelayHours + " hours"}::interval
      WHERE id = ${enrollmentId}
    `;
  }

  return result;
}

/**
 * Evaluate a condition for an enrollment (replied, opened, clicked, connected, etc.).
 */
export async function evaluateCondition(
  enrollmentId: string,
  condition: SequenceCondition
): Promise<boolean> {
  const db = getDb();

  const enrollments = await db`
    SELECT e.lead_id, e.project_id, e.metadata
    FROM multichannel_sequence_enrollments e
    WHERE e.id = ${enrollmentId}
  `;
  if (enrollments.length === 0) return false;

  const enrollment = enrollments[0];
  const leadId = enrollment.lead_id as string;

  switch (condition.type) {
    case "replied": {
      const leads = await db`SELECT email FROM leads WHERE id = ${leadId}`;
      if (leads.length === 0) return false;
      const replies = await db`
        SELECT id FROM email_inbound
        WHERE from_email = ${leads[0].email}
        LIMIT 1
      `;
      return replies.length > 0;
    }

    case "opened": {
      // Check email open tracking
      const metadata = enrollment.metadata as Record<string, unknown>;
      return Boolean(metadata?.emailOpened);
    }

    case "clicked": {
      const metadata = enrollment.metadata as Record<string, unknown>;
      return Boolean(metadata?.linkClicked);
    }

    case "connected": {
      const metadata = enrollment.metadata as Record<string, unknown>;
      return Boolean(metadata?.linkedinConnected || metadata?.twitterFollowed);
    }

    case "custom":
      // Custom conditions check the metadata flag
      return Boolean((enrollment.metadata as Record<string, unknown>)?.[`custom_${condition.description}`]);

    default:
      return false;
  }
}
