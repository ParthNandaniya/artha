import { getDb, emitPipelineEvent } from "../db";
import { buildTaskContext, ingestTaskResult } from "@/lib/supermemory";
import { executeTask } from "@/lib/ai/tasks/task-runner";
import { getAgentReplyTo, sendAgentReply, sendNightlyTaskUpdate } from "@/lib/postmark";
import { processOutreachEmails } from "@/lib/outreach";
import { runResearchAgent } from "@/lib/agents/research";
import type { Task, AgentName } from "@/lib/types";
import { canSendProjectEmail, getEmailSetupBlockedReason } from "@/lib/project-integrations";
import { incrementProjectCredits } from "@/lib/project-credits";
import { getCreditCost } from "@/config/credit-costs";
import { getProjectAnalyticsSummary } from "@/lib/analytics-context";
import { getSubscriberSummary } from "@/lib/marketplace";
import { logAgentActivity } from "@/lib/agent-activity";

export async function processTaskJob(jobId: string, payload: Record<string, unknown>) {
  const db = getDb();
  const { projectId, taskId, replyToEmail, replyToSubject, replyToMessageId, queuedBy } = payload as {
    projectId: string;
    taskId: string;
    replyToEmail?: string;
    replyToSubject?: string;
    replyToMessageId?: string;
    queuedBy?: string;
  };

  const projects = await db`
    SELECT p.id, p.slug, p.name, p.user_id, p.company_email, p.email_setup_status, p.email_setup_error,
           u.email AS user_email, u.name AS user_name
    FROM projects p
    JOIN users u ON u.id = p.user_id
    WHERE p.id = ${projectId}
  `;
  if (projects.length === 0) throw new Error("Project not found");
  const project = projects[0];

  const tasks = await db`SELECT * FROM tasks WHERE project_id = ${projectId} AND id = ${taskId}`;
  if (tasks.length === 0) throw new Error("Task not found");
  const task = tasks[0] as unknown as Task;

  await db`UPDATE tasks SET status = 'running', started_at = NOW() WHERE project_id = ${projectId} AND id = ${taskId}`;
  await logAgentActivity({
    projectId,
    agentType: "task_runner",
    action: "executed",
    title: `Started: ${task.title}`,
    description: `Running ${task.type || "custom"} task${queuedBy ? ` (queued by ${queuedBy})` : ""}`,
    metadata: { taskId, taskType: task.type, agent: task.agent, queuedBy },
  }).catch(() => {});
  await emitPipelineEvent(
    jobId,
    projectId,
    "run_task",
    "running",
    `Executing: ${task.title}`,
    "info",
    { taskId, taskTitle: task.title, taskType: task.type }
  );
  await emitPipelineEvent(
    jobId,
    projectId,
    "task_context",
    "running",
    "Reviewing company context, memory, and recent work..."
  );

  const contextBlock = await buildTaskContext({
    projectId,
    userId: project.user_id as string,
    taskDescription: task.prompt || task.description || task.title,
  });
  await emitPipelineEvent(
    jobId,
    projectId,
    "task_context",
    "completed",
    "Context loaded. Tailoring the task to the current company state.",
    "success"
  );

  const autoSend = await getAutoSendSetting(db, projectId);
  const canSendEmails = canSendProjectEmail(project);
  const emailSendBlockedReason = getEmailSetupBlockedReason(project);

  try {
    if (task.type === "research") {
      await emitPipelineEvent(
        jobId,
        projectId,
        "task_execute",
        "running",
        "Research agent is gathering live web data and drafting the report..."
      );
      const output = await runResearchAgent({
        prompt: task.prompt || task.description || task.title,
        context: contextBlock,
        projectId,
        userId: project.user_id as string,
        taskId,
        metadata: {
          researchType: typeof payload.researchType === "string" ? payload.researchType : undefined,
        },
      });

      if (!output.success) {
        throw new Error(output.error || "Research failed");
      }

      let documentCount = 0;
      if (output.documents?.length) {
        await emitPipelineEvent(
          jobId,
          projectId,
          "task_output",
          "running",
          `Saving ${output.documents.length} research document${output.documents.length === 1 ? "" : "s"} to the workspace...`
        );
        for (const doc of output.documents) {
          // Skip fallback "output" docs — raw agent text, not real documents
          if (doc.type === "output" && doc.title === "Agent Output") continue;
          await db`
            INSERT INTO documents (project_id, type, title, content, metadata)
            VALUES (${projectId}, ${doc.type}, ${doc.title}, ${doc.content}, ${JSON.stringify(doc.metadata || {})}::jsonb)
          `;
          documentCount++;
        }
      }

      await emitPipelineEvent(
        jobId,
        projectId,
        "task_output",
        "completed",
        documentCount > 0
          ? `Saved ${documentCount} research document${documentCount === 1 ? "" : "s"} to the dashboard.`
          : "Research completed without creating a new document.",
        "success"
      );

      await db`
        UPDATE tasks
        SET status = 'completed',
            result = ${JSON.stringify({
              documentsCreated: documentCount,
              links: output.links || [],
            })},
            summary = ${output.summary},
            completed_at = NOW()
        WHERE project_id = ${projectId} AND id = ${taskId}
      `;

      await emitPipelineEvent(
        jobId,
        projectId,
        "task_memory",
        "running",
        "Saving the key findings to company memory for future tasks..."
      );
      await emitPipelineEvent(jobId, projectId, "run_task", "completed", output.summary, "success");

      await ingestTaskResult({
        projectId,
        userId: project.user_id as string,
        taskId,
        taskTitle: task.title,
        taskType: task.type || "custom",
        summary: output.summary,
        result: documentCount ? `documents:${documentCount}` : undefined,
      });
      await emitPipelineEvent(
        jobId,
        projectId,
        "task_memory",
        "completed",
        "Company memory updated with the research outcome.",
        "success"
      );

      if (queuedBy === "cron") {
        await sendCronTaskUpdateEmail(db, project, { title: task.title, summary: output.summary });
      }

      if (replyToEmail) {
        await sendAgentReply({
          toEmail: replyToEmail,
          subject: `Re: ${replyToSubject || "Task update"}`,
          bodyHtml: `<p style="font-size:15px;line-height:1.6;color:#374151;">${output.summary}</p>
            <p style="margin:16px 0 0;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:12px;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://artha.run"}/dashboard" style="color:#2563eb;">View full details in dashboard</a>
            </p>`,
          inReplyTo: replyToMessageId,
          replyTo: getAgentReplyTo(project.slug as string),
        });
      }

      return;
    }

    await emitPipelineEvent(
      jobId,
      projectId,
      "task_execute",
      "running",
      buildExecutionMessage(task, autoSend)
    );
    const { result, summary, needsConfirmation } = await executeTask(task, contextBlock, { autoSend });

    if (needsConfirmation && (task.type === "outreach" || task.type === "newsletter")) {
      await db`
        UPDATE tasks SET status = 'pending_confirmation', result = ${JSON.stringify(result)}, summary = ${summary}
        WHERE project_id = ${projectId} AND id = ${taskId}
      `;
      await emitPipelineEvent(
        jobId,
        projectId,
        "task_review",
        "pending_confirmation",
        "Draft prepared. Waiting for your review before anything goes out."
      );
      await emitPipelineEvent(jobId, projectId, "run_task", "pending_confirmation", `${summary} — awaiting confirmation`, "info");

      if (replyToEmail) {
        await sendAgentReply({
          toEmail: replyToEmail,
          subject: `Re: ${replyToSubject || "Task update"}`,
          bodyHtml: `<p style="font-size:15px;line-height:1.6;color:#374151;">
            ${summary}
          </p>
          <p style="font-size:14px;color:#6b7280;">
            The emails are ready for your review. <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://artha.run"}/dashboard" style="color:#2563eb;">Open dashboard to confirm and send.</a>
          </p>`,
          inReplyTo: replyToMessageId,
          replyTo: getAgentReplyTo(project.slug as string),
        });
      }
      return;
    }

    if (task.type === "outreach" && !needsConfirmation && !canSendEmails) {
      await db`
        UPDATE tasks SET status = 'pending_confirmation', result = ${JSON.stringify(result)}, summary = ${summary}
        WHERE project_id = ${projectId} AND id = ${taskId}
      `;
      await emitPipelineEvent(
        jobId,
        projectId,
        "task_review",
        "pending_confirmation",
        "Draft prepared, but email setup is not ready yet. Review and send once setup is complete."
      );
      await emitPipelineEvent(
        jobId,
        projectId,
        "run_task",
        "pending_confirmation",
        `${summary} — ${emailSendBlockedReason || "email setup is not ready yet."}`,
        "info"
      );

      if (replyToEmail) {
        await sendAgentReply({
          toEmail: replyToEmail,
          subject: `Re: ${replyToSubject || "Task update"}`,
          bodyHtml: `<p style="font-size:15px;line-height:1.6;color:#374151;">${summary}</p>
          <p style="font-size:14px;color:#6b7280;">
            ${emailSendBlockedReason || "Email setup is not ready yet."}
            <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://artha.run"}/dashboard" style="color:#2563eb;"> Open dashboard to review the drafts after setup is complete.</a>
          </p>`,
          inReplyTo: replyToMessageId,
          replyTo: getAgentReplyTo(project.slug as string),
        });
      }
      return;
    }

    if (task.type === "outreach" && !needsConfirmation) {
      const emails = (result as Record<string, unknown>).emails as Array<{ to: string; toName?: string; subject: string; body: string }>;
      if (emails?.length) {
        await emitPipelineEvent(
          jobId,
          projectId,
          "task_delivery",
          "running",
          `Sending ${emails.length} outreach email${emails.length === 1 ? "" : "s"} from your company inbox...`
        );
        const outreachResult = await processOutreachEmails({
          projectId,
          slug: project.slug as string,
          companyName: project.name as string,
          emails,
        });
        const parts = [`Sent ${outreachResult.sent} outreach email${outreachResult.sent === 1 ? "" : "s"}`];
        if (outreachResult.failed > 0) parts.push(`${outreachResult.failed} failed`);
        if (outreachResult.skipped > 0) parts.push(`${outreachResult.skipped} skipped (no email)`);
        if (outreachResult.creditLimited > 0) parts.push(`${outreachResult.creditLimited} not sent (insufficient credits)`);
        await emitPipelineEvent(
          jobId,
          projectId,
          "task_delivery",
          "completed",
          `${parts.join(", ")}.`,
          outreachResult.creditLimited > 0 ? "info" : "success"
        );
      }
    }

    await emitPipelineEvent(
      jobId,
      projectId,
      "task_output",
      "running",
      "Saving the result to the dashboard and updating task state..."
    );
    // Handle recurring tasks: reset to pending with next_run_at instead of staying completed
    if (task.is_recurring && (task as unknown as Record<string, unknown>).recurrence_interval) {
      const interval = (task as unknown as Record<string, unknown>).recurrence_interval as string;
      const nextRunAt = computeNextRunAt(interval);
      await db`
        UPDATE tasks
        SET status = 'pending',
            result = ${JSON.stringify(result)},
            summary = ${summary},
            completed_at = NOW(),
            last_run_at = NOW(),
            next_run_at = ${nextRunAt},
            recurrence_count = COALESCE(recurrence_count, 0) + 1
        WHERE project_id = ${projectId} AND id = ${taskId}
      `;
    } else {
      await db`
        UPDATE tasks SET status = 'completed', result = ${JSON.stringify(result)}, summary = ${summary}, completed_at = NOW()
        WHERE project_id = ${projectId} AND id = ${taskId}
      `;
    }
    await emitPipelineEvent(
      jobId,
      projectId,
      "task_output",
      "completed",
      "Task output saved to the dashboard.",
      "success"
    );

    await emitPipelineEvent(
      jobId,
      projectId,
      "task_memory",
      "running",
      "Saving this result to company memory so future tasks can build on it..."
    );
    await emitPipelineEvent(jobId, projectId, "run_task", "completed", summary, "success");

    await ingestTaskResult({
      projectId,
      userId: project.user_id as string,
      taskId,
      taskTitle: task.title,
      taskType: task.type || "custom",
      summary,
      result: typeof result === "object" ? JSON.stringify(result).slice(0, 2000) : undefined,
    });
    await emitPipelineEvent(
      jobId,
      projectId,
      "task_memory",
      "completed",
      "Company memory updated with the task outcome.",
      "success"
    );

    await logAgentActivity({
      projectId,
      agentType: "task_runner",
      action: "completed",
      title: `Completed: ${task.title}`,
      description: summary,
      metadata: { taskId, taskType: task.type, agent: task.agent, creditCost: getCreditCost(task.agent as AgentName | null) },
    }).catch(() => {});

    if (queuedBy === "cron") {
      await sendCronTaskUpdateEmail(db, project, { title: task.title, summary });
    }

    if (replyToEmail) {
      await sendAgentReply({
        toEmail: replyToEmail,
        subject: `Re: ${replyToSubject || "Task update"}`,
        bodyHtml: `<p style="font-size:15px;line-height:1.6;color:#374151;">
          Done! Here's what happened:
        </p>
        <p style="font-size:14px;line-height:1.6;color:#374151;">${summary}</p>
        <p style="margin:16px 0 0;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:12px;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://artha.run"}/dashboard" style="color:#2563eb;">View full details in dashboard</a>
        </p>`,
        inReplyTo: replyToMessageId,
        replyTo: getAgentReplyTo(project.slug as string),
      });
    }
  } catch (err) {
    await db`UPDATE tasks SET status = 'failed', summary = ${String(err)}, completed_at = NOW() WHERE project_id = ${projectId} AND id = ${taskId}`;
    await emitPipelineEvent(jobId, projectId, "run_task", "failed", String(err), "error");
    await logAgentActivity({
      projectId,
      agentType: "task_runner",
      action: "failed",
      title: `Failed: ${task.title}`,
      description: String(err).slice(0, 500),
      metadata: { taskId, taskType: task.type, agent: task.agent },
    }).catch(() => {});

    // Refund credit — task was charged upfront before queueing (by /api/tasks/run, cron, or generate-tasks)
    try {
      const cost = getCreditCost(task.agent as AgentName | null);
      if (cost > 0) {
        await incrementProjectCredits(db, projectId, cost);
        await emitPipelineEvent(jobId, projectId, "credit_refund", "completed", `Refunded ${cost} credit${cost !== 1 ? "s" : ""} for failed task`, "info");
      }
    } catch (refundErr) {
      console.error("Failed to refund credits for failed task:", refundErr);
    }

    if (replyToEmail) {
      await sendAgentReply({
        toEmail: replyToEmail,
        subject: `Re: ${replyToSubject || "Task update"}`,
        bodyHtml: `<p style="font-size:15px;color:#dc2626;">Task failed: ${String(err).slice(0, 200)}</p>
          <p style="font-size:13px;color:#6b7280;"><a href="${process.env.NEXT_PUBLIC_APP_URL || "https://artha.run"}/dashboard" style="color:#2563eb;">View dashboard</a></p>`,
        inReplyTo: replyToMessageId,
        replyTo: getAgentReplyTo(project.slug as string),
      }).catch(() => {});
    }

    throw err;
  }
}

function buildExecutionMessage(task: Task, autoSend: boolean): string {
  if (task.type === "outreach") {
    return autoSend
      ? "Planning the outreach angle, drafting emails, and preparing them to send automatically..."
      : "Planning the outreach angle and drafting emails for review...";
  }

  if (task.type === "newsletter") {
    return "Structuring the newsletter and writing the draft...";
  }

  return "Generating the deliverable with the latest company context...";
}

async function sendCronTaskUpdateEmail(
  db: ReturnType<typeof getDb>,
  project: Record<string, unknown>,
  completedTask: { title: string; summary: string }
) {
  try {
    const projectId = project.id as string;
    const [pending, analytics, subscriberStats] = await Promise.all([
      db`
        SELECT title FROM tasks
        WHERE project_id = ${projectId} AND status IN ('queued', 'pending')
        ORDER BY priority ASC LIMIT 5
      `,
      getProjectAnalyticsSummary(projectId),
      getSubscriberSummary(projectId),
    ]);

    await sendNightlyTaskUpdate({
      slug: project.slug as string,
      companyName: project.name as string,
      toEmail: project.user_email as string,
      toName: project.user_name as string | null,
      completedTask,
      tasksPending: pending.map((t: Record<string, unknown>) => ({ title: t.title as string })),
      analytics: analytics.hasActivity ? analytics : undefined,
      revenue: subscriberStats.hasSubscribers ? {
        activeSubscribers: subscriberStats.activeCount,
        newLast7Days: subscriberStats.newLast7Days,
        mrrCents: subscriberStats.mrrCents,
        revenueLast7DaysCents: subscriberStats.revenueLast7DaysCents,
      } : undefined,
    });
  } catch (err) {
    // Non-fatal — don't fail the task because the email failed
    console.error("[task] Failed to send nightly task update email:", err);
  }
}

function computeNextRunAt(interval: string): string {
  const now = new Date();
  switch (interval) {
    case "daily":
      now.setDate(now.getDate() + 1);
      break;
    case "weekly":
      now.setDate(now.getDate() + 7);
      break;
    case "biweekly":
      now.setDate(now.getDate() + 14);
      break;
    case "monthly":
      now.setMonth(now.getMonth() + 1);
      break;
    default:
      now.setDate(now.getDate() + 7); // default to weekly
  }
  return now.toISOString();
}

async function getAutoSendSetting(db: ReturnType<typeof getDb>, projectId: string): Promise<boolean> {
  try {
    const rows = await db`SELECT settings FROM company_profile WHERE project_id = ${projectId} LIMIT 1`;
    if (rows.length > 0) {
      const settings = rows[0].settings as Record<string, unknown> | null;
      return settings?.outreach_auto_send === true;
    }
  } catch {
    // settings column may not exist yet
  }
  return false;
}
