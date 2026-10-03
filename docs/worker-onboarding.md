# Worker onboarding flow

This document explains how onboarding execution works after a user clicks "Build my company", and where the worker still participates.

## Overview

- The API route `src/app/api/ai/run-pipeline/route.ts` creates a `run_pipeline` job in `running` state and starts it immediately in the web runtime.
- The background launcher lives in `src/lib/pipeline-jobs.ts` and calls `processPipelineJob` asynchronously.
- The worker process `src/worker/index.ts` still polls `job_queue`, claims pending jobs, and reaps stalled jobs. It remains important for queued job types such as `run_task`, `send_digest`, and `send_email`.
- Pipeline progress is written as rows in `pipeline_events` through `emitPipelineEvent` in `src/worker/db.ts`, and the UI polls it via `/api/ai/pipeline-status`.

## Instant-start behavior

For onboarding builds, the default path is now:

- Only one `run_pipeline` job may run per user at a time.
- If the same user starts another build while one is already running, the API reconnects the UI to the existing running job instead of queuing a second one.
- Any stale pending onboarding jobs for that user are failed and replaced by the new request.
- Different users can start onboarding in parallel because each request launches its own background execution immediately.

The helper functions for this live in `src/lib/pipeline-jobs.ts`.

## Worker claim behavior

The worker still claims queued jobs conservatively:

- FIFO by `created_at`/`id`.
- Per-user serialization: only one running job per user.
- Pending jobs for a user are processed in order.
- `FOR UPDATE SKIP LOCKED` prevents two workers from claiming the same job.

This logic is implemented in `claimJob()` in `src/worker/index.ts`.

## Onboarding pipeline steps (`run_pipeline`)

The worker executes `processPipelineJob` in `src/worker/processors/pipeline.ts` and emits events for each step:

| Step id | Purpose |
| --- | --- |
| `user_research` | Build/reuse founder profile research and store memory. |
| `research_idea` | Analyze idea, competitors, market size, and timing. |
| `save_profile` | Persist optional user profile context and memory. |
| `name_company` | Generate company name and tagline. |
| `create_project` | Create platform `projects` row in `onboarding` status. |
| `provision_db` | Create isolated Neon DB and save connection metadata. |
| `init_schema` | Initialize company tables and seed memory/profile fields. |
| `mission` | Generate mission/strategy document. |
| `market_research` | Generate market research report + structured metadata. |
| `landing_page` | Build and publish landing page HTML. |
| `tweet_launch` | Attempt launch tweet post from `@tryarthaHQ` (non-blocking). |
| `email_setup` | Attempt company email setup via Postmark (non-blocking). |
| `github_repo` | Create the project GitHub repo in `artha-companies` (non-blocking). |
| `push_website` | Commit the generated website/config files to the repo `main` branch when possible. |
| `cloudflare_setup` | Ensure a Cloudflare Pages project is connected to that repo and mapped to `{slug}.tryartha.com`. |
| `task_queue` | Generate recurring tasks, insert queue, set project `active`. |
| `welcome_email` | Send founder welcome email with summary links. |
| `done` | Final completion event with `projectId` and `slug`. |

Notes:

- Some steps are best-effort and do not fail the whole onboarding flow (tweet/email setup/repo/cloudflare).
- The project becomes `active` at `task_queue`.
- On a successful website hosting setup, onboarding creates `artha-companies/{slug}`, commits the initial site to `main`, and configures Cloudflare Pages so future `main` commits auto-deploy to `{slug}.tryartha.com`.
- Onboarding picks a unique project slug before creating the project row, so the repo name, site subdomain, and email prefix stay aligned.
- Website edits made inside Artha stay in preview until the user clicks deploy. That deploy path re-runs the repo push + Cloudflare Pages setup flow, and it can recover by reusing an already-created repo if the DB pointer was missing.

## Worker runtime behavior

Environment-driven runtime controls in `src/worker/index.ts`:

- `WORKER_CONCURRENCY` (default `2`): number of polling loops.
- `WORKER_POLL_INTERVAL` (default `2000` ms): idle wait between polls.
- `WORKER_RUNNING_STALL_SECONDS` (default `600`): pipeline inactivity threshold.
- `WORKER_RUNNING_MAX_SECONDS` (default `1800`): hard max runtime for any running job.
- `WORKER_STALLED_SWEEP_INTERVAL_MS` (default `15000`): stalled-job sweep interval.

Stalled/recovery behavior:

- Worker periodically reaps stalled running jobs (`reapStalledJobs()`), marks them `failed`, and records reason.
- UI can detect pending stalls via `/api/ai/pipeline-status` (`claiming`, `worker_unavailable`, etc.).
- User can recover from UI via `/api/ai/pipeline-recover`:
  - `retry`: start a fresh pipeline job immediately with the same payload.
  - `run_now`: take a pending job and start it immediately in the background.

## Local development

Run web app and worker separately:

```bash
npm run dev
npm run worker
```

If onboarding appears stuck in local development, check that the worker is running and that `DATABASE_URL` points to the same platform DB used by the web app.
