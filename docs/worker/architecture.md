# Worker Architecture

The background worker processes long-running AI tasks asynchronously via a job queue.

**Entry point:** `src/worker/index.ts`

## How It Works

The worker is a separate Node.js process that polls the `job_queue` table for pending jobs.

```
┌─────────────────────────────────────────┐
│            Worker Process               │
│                                         │
│  ┌─────────┐  ┌─────────┐              │
│  │ Worker 1 │  │ Worker 2 │  (2 slots)  │
│  └────┬─────┘  └────┬─────┘            │
│       │              │                   │
│       ▼              ▼                   │
│  ┌──────────────────────┐               │
│  │    claimJob()         │  (every 2s)  │
│  │    FOR UPDATE         │               │
│  │    SKIP LOCKED        │               │
│  └──────────┬───────────┘               │
│             │                            │
│             ▼                            │
│  ┌──────────────────────┐               │
│  │    processJob()       │               │
│  │    ├─ run_pipeline    │               │
│  │    ├─ run_task        │               │
│  │    ├─ send_digest     │               │
│  │    ├─ send_email      │               │
│  │    └─ generate_tasks  │               │
│  └──────────────────────┘               │
└─────────────────────────────────────────┘
```

## Job Queue

Jobs are stored in the `job_queue` table with these states:

| Status | Description |
|--------|-------------|
| `pending` | Waiting to be claimed |
| `running` | Claimed by a worker |
| `completed` | Successfully finished |
| `failed` | Error occurred |

### Job Types

| Type | Processor | Description |
|------|-----------|-------------|
| `run_pipeline` | `processPipelineJob()` | 14-step company onboarding |
| `run_task` | `processTaskJob()` | Execute a single AI task |
| `send_digest` | `processEmailJob("digest")` | Send morning digest email |
| `send_email` | `processEmailJob("send")` | Send outbound company email |
| `generate_tasks` | `processGenerateTasksJob()` | AI-generate new tasks |

## Concurrency

- **Worker count:** 2 (configurable via `WORKER_CONCURRENCY`)
- **Poll interval:** 2 seconds (configurable via `WORKER_POLL_INTERVAL`)
- **Per-user serialization:** Jobs for the same user are processed one at a time
- **Cross-user parallelism:** Different users' jobs run concurrently

### Job Claiming

Uses PostgreSQL `FOR UPDATE SKIP LOCKED` to prevent race conditions between workers:

```sql
SELECT * FROM job_queue
WHERE status = 'pending'
ORDER BY created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

## Flowchart: Job Processing Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│               JOB LIFECYCLE                                      │
│                                                                   │
│  ┌──────────────┐                                                │
│  │ Job created  │  (API route, cron, or chat)                   │
│  │ status:      │                                                │
│  │  pending     │                                                │
│  └──────┬───────┘                                                │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────────┐                                        │
│  │ Worker polls (2s)    │                                        │
│  │ SELECT ... FOR UPDATE│                                        │
│  │ SKIP LOCKED          │                                        │
│  └──────┬───────────────┘                                        │
│         │ claims job                                             │
│         ▼                                                        │
│  ┌──────────────────────┐                                        │
│  │ status: running      │                                        │
│  │ claimed_at: NOW()    │                                        │
│  └──────┬───────────────┘                                        │
│         │                                                        │
│         ├─── run_pipeline ────▶ processPipelineJob()             │
│         ├─── run_task ────────▶ processTaskJob()                 │
│         ├─── send_digest ─────▶ processEmailJob("digest")       │
│         ├─── send_email ──────▶ processEmailJob("send")         │
│         └─── generate_tasks ──▶ processGenerateTasksJob()       │
│         │                                                        │
│    ┌────┴────┐                                                   │
│    ▼         ▼                                                   │
│  ┌────────┐ ┌────────┐                                          │
│  │Success │ │ Error  │                                          │
│  │        │ │        │                                          │
│  │status: │ │status: │  ◀── or stall detection                  │
│  │complete│ │failed  │      (30 min timeout)                    │
│  └────────┘ └────────┘                                          │
└─────────────────────────────────────────────────────────────────┘
```

## Stall Detection

The worker monitors for stuck jobs and recovers them.

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `RUNNING_MAX_SECONDS` | 1800 (30 min) | Max job runtime before marking failed |
| `RUNNING_STALL_SECONDS` | 600 (10 min) | For pipelines: no progress event in this window = stalled |
| Reap interval | 15 seconds | How often stall detection runs |

### Recovery Logic

`reapStalledJobs()` runs every 15 seconds:

1. Find jobs with `status = 'running'` AND `claimed_at < NOW() - RUNNING_MAX_SECONDS`
2. For pipeline jobs: also check if latest `pipeline_events` entry is older than `RUNNING_STALL_SECONDS`
3. Mark stalled jobs as `failed`
4. Mark associated tasks as `failed`
5. For non-subscribed projects: update DB expiry countdown

## Running the Worker

```bash
# Development (separate terminal)
npm run worker

# Production
# Worker runs as a separate process alongside the Next.js server
```

The worker loads environment from `.env` and `.env.local` at startup.

## Event Logging

All pipeline steps emit events via `emitPipelineEvent()` in `src/worker/db.ts`:

```typescript
emitPipelineEvent(jobId, projectId, step, status, logMessage, logType, data)
```

Events are stored in `pipeline_events` table and consumed by the dashboard for real-time progress display.
