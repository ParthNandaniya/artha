/**
 * cron-job.org API client — CRUD for external cron job triggers.
 * Docs: https://docs.cron-job.org/rest-api.html
 */

const API_BASE = "https://api.cron-job.org";

function getApiKey(): string {
  const key = process.env.CRONJOB_ORG_API_KEY;
  if (!key) throw new Error("CRONJOB_ORG_API_KEY is not set");
  return key;
}

async function apiFetch<T>(
  path: string,
  method: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`cron-job.org API error ${res.status}: ${text}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

// ── Types ───────────────────────────────────────────────────────────

export interface CronSchedule {
  timezone: string;
  hours: number[];
  mdays: number[];
  minutes: number[];
  months: number[];
  wdays: number[];
  expiresAt: number;
}

export interface CronJob {
  jobId: number;
  enabled: boolean;
  title: string;
  url: string;
  schedule: CronSchedule;
}

// ── CRUD ────────────────────────────────────────────────────────────

export async function createCronJob(opts: {
  title: string;
  url: string;
  schedule: CronSchedule;
  headers?: Record<string, string>;
  enabled?: boolean;
}): Promise<{ jobId: number }> {
  return apiFetch<{ jobId: number }>("/jobs", "PUT", {
    job: {
      url: opts.url,
      title: opts.title,
      enabled: opts.enabled ?? true,
      saveResponses: true,
      requestMethod: 1, // POST
      requestTimeout: 300,
      schedule: opts.schedule,
      extendedData: {
        headers: opts.headers ?? {},
        body: "",
      },
      notification: {
        onFailure: true,
        onSuccess: false,
        onDisable: true,
      },
    },
  });
}

export async function updateCronJob(
  jobId: number,
  opts: Partial<{
    title: string;
    url: string;
    schedule: CronSchedule;
    enabled: boolean;
  }>
): Promise<void> {
  await apiFetch(`/jobs/${jobId}`, "PATCH", { job: opts });
}

export async function deleteCronJob(jobId: number): Promise<void> {
  await apiFetch(`/jobs/${jobId}`, "DELETE");
}

export async function listCronJobs(): Promise<CronJob[]> {
  const res = await apiFetch<{ jobs: CronJob[] }>("/jobs", "GET");
  return res.jobs ?? [];
}

// ── Schedule helpers ────────────────────────────────────────────────

const DEFAULT_TIMEZONE = "UTC";

/** Build a cron-job.org schedule from a simple frequency string */
export function buildSchedule(
  frequency: string,
  opts?: {
    preferredHour?: number;
    preferredDay?: number; // 0=Sun..6=Sat
    timezone?: string;
  }
): CronSchedule {
  const tz = opts?.timezone ?? DEFAULT_TIMEZONE;
  const hour = opts?.preferredHour ?? 0;
  const base: CronSchedule = {
    timezone: tz,
    hours: [hour],
    mdays: [-1],
    minutes: [0],
    months: [-1],
    wdays: [-1],
    expiresAt: 0,
  };

  switch (frequency) {
    case "every_30m":
      return { ...base, hours: [-1], minutes: [0, 30] };
    case "every_4h":
      return { ...base, hours: [0, 4, 8, 12, 16, 20], minutes: [0] };
    case "every_6h":
      return { ...base, hours: [0, 6, 12, 18], minutes: [0] };
    case "daily":
      return { ...base, hours: [hour] };
    case "weekly":
      return { ...base, hours: [hour], wdays: [opts?.preferredDay ?? 1] };
    case "monthly":
      return { ...base, hours: [hour], mdays: [1] };
    default:
      return base;
  }
}

/** Build the auth header object for cron-job.org jobs */
export function buildCronHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
    "Content-Type": "application/json",
  };
}
