import { getDb, emitPipelineEvent } from "../db";
import { buildTaskContext } from "@/lib/supermemory";
import { runTaskGeneratorAgent } from "@/lib/agents/task-generator";
import { getProjectCredits, decrementProjectCredits } from "@/lib/project-credits";
import { getCreditCost } from "@/config/credit-costs";
import type { AgentName } from "@/lib/types";

export async function processGenerateTasksJob(
  jobId: string,
  payload: Record<string, unknown>
) {
  const db = getDb();
  const { projectId, count, thenExecuteTop } = payload as {
    projectId: string;
    count?: number;
    thenExecuteTop?: boolean;
  };

  const projects = await db`
    SELECT id, user_id
    FROM projects
    WHERE id = ${projectId}
  `;
  if (projects.length === 0) throw new Error("Project not found");
  const project = projects[0];

  await emitPipelineEvent(
    jobId,
    projectId,
    "generate_tasks",
    "running",
    "Generating new tasks based on company context..."
  );

  const context = await buildTaskContext({
    projectId,
    userId: project.user_id as string,
    taskDescription: "Generate high-impact tasks for this company",
  });

  const result = await runTaskGeneratorAgent({
    prompt: "Generate the highest-impact tasks for this company right now",
    context,
    projectId,
    userId: project.user_id as string,
    metadata: { count: count || 5 },
  });

  if (!result.success || !result.tasksCreated?.length) {
    await emitPipelineEvent(
      jobId,
      projectId,
      "generate_tasks",
      "failed",
      result.error || "No tasks generated",
      "error"
    );
    throw new Error(result.error || "Task generation returned no tasks");
  }

  const maxPriority = await db`
    SELECT COALESCE(MAX(priority), 0) as max_p
    FROM tasks
    WHERE project_id = ${projectId} AND status IN ('queued', 'pending')
  `;
  let nextPriority = (maxPriority[0]?.max_p || 0) + 1;

  for (const task of result.tasksCreated) {
    await db`
      INSERT INTO tasks (project_id, type, title, description, status, priority, prompt, is_recurring, source, tag, agent, revenue_impact)
      VALUES (
        ${projectId},
        ${task.type || "custom"},
        ${task.title},
        ${task.description},
        'queued',
        ${nextPriority},
        ${task.description},
        false,
        'system',
        ${task.tag || null},
        ${task.agent || null},
        ${task.revenue_impact || null}
      )
    `;
    nextPriority++;
  }

  await emitPipelineEvent(
    jobId,
    projectId,
    "generate_tasks",
    "completed",
    `Generated ${result.tasksCreated.length} tasks`,
    "info",
    { count: result.tasksCreated.length }
  );

  if (thenExecuteTop) {
    const topTask = await db`
      SELECT id, agent FROM tasks
      WHERE project_id = ${projectId} AND status = 'queued'
      ORDER BY priority ASC
      LIMIT 1
    `;
    if (topTask.length > 0) {
      // Check credits before queueing execution (generation cost already deducted by cron)
      const projectRows = await db`SELECT task_credits FROM projects WHERE id = ${projectId}`;
      const creditsAvailable = projectRows.length > 0 ? getProjectCredits(projectRows[0] as Record<string, unknown>) : 0;
      const cost = getCreditCost(topTask[0].agent as AgentName | null);

      if (creditsAvailable >= cost) {
        await decrementProjectCredits(db, projectId, cost);
        await db`
          INSERT INTO job_queue (type, payload)
          VALUES ('run_task', ${JSON.stringify({
            projectId,
            taskId: topTask[0].id,
            queuedBy: "auto_generate",
          })}::jsonb)
        `;
      }
    }
  }

  console.log(
    `[worker] Generated ${result.tasksCreated.length} tasks for project ${projectId}`
  );
}
