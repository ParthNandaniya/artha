import { getDb } from "./neon";

export interface ProjectMemory {
  companyName?: string;
  companyDescription: string;
  tagline?: string;
  mission?: string;
  targetAudience?: string;
  competitors?: string[];
  keyInsights?: string[];
  landingPageUrl?: string;
  emailConfigured?: boolean;
  userBackground?: string;
  [key: string]: unknown;
}

export async function getProjectMemory(projectId: string): Promise<ProjectMemory> {
  const db = getDb();
  const rows = await db`SELECT memory FROM projects WHERE id = ${projectId}`;
  return (rows[0]?.memory as ProjectMemory) || {};
}

export async function updateProjectMemory(projectId: string, updates: Partial<ProjectMemory>) {
  const db = getDb();
  const current = await getProjectMemory(projectId);
  const merged = { ...current, ...updates };
  await db`UPDATE projects SET memory = ${JSON.stringify(merged)}::jsonb WHERE id = ${projectId}`;
  return merged;
}
