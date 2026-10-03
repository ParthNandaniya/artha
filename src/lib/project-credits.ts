import type { DbClient } from "@/lib/neon";

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function getProjectCredits(project: Record<string, unknown>): number {
  return Math.max(0, toNumber(project.task_credits));
}

export function withProjectCredits<T extends Record<string, unknown>>(project: T): T & { task_credits: number } {
  return {
    ...project,
    task_credits: getProjectCredits(project),
  };
}

export async function decrementProjectCredits(db: DbClient, projectId: string, amount = 1): Promise<void> {
  if (amount <= 0) return;
  await db`
    UPDATE projects
    SET task_credits = GREATEST(COALESCE(task_credits, 0) - ${amount}, 0)
    WHERE id = ${projectId}
  `;
}

export async function incrementProjectCredits(db: DbClient, projectId: string, amount = 1): Promise<void> {
  if (amount <= 0) return;
  await db`
    UPDATE projects
    SET task_credits = COALESCE(task_credits, 0) + ${amount}
    WHERE id = ${projectId}
  `;
}
