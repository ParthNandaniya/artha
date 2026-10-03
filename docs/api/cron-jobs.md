# Cron Jobs

Scheduled endpoints that run on a timer. All require `Authorization: Bearer <CRON_SECRET>` header.

## Morning Digest

### `POST /api/cron/morning-digest`

Sends daily digest emails to active, subscribed projects.

**Schedule:** Daily (typically 8 AM user timezone)

**Logic:**
1. Query all projects where `status = 'active'` AND `subscription_status = 'active'` AND website DB is provisioned
2. For each project, enqueue a `send_digest` job in `job_queue`

**Digest content** (assembled by email processor):
- Completed tasks (last 24 hours)
- Upcoming tasks (next 5 queued)
- Site analytics summary (pageviews, visitors, engagement)
- Subscriber/revenue stats (if marketplace enabled)
- Semantic context highlights from Supermemory

See [Email Processor](../worker/email-processor.md) for digest assembly details.

## Nightly Tasks

### `POST /api/cron/nightly-tasks`

Automatically executes or generates tasks for projects with credits.

**Schedule:** Daily (late evening)

**Logic:**
1. Query all projects with `task_credits > 0`
2. For each project:
   - **Has queued tasks:** Enqueue `run_task` job for the top-priority task
   - **No queued tasks:** Enqueue `generate_tasks` job (creates 5 new tasks, then executes the top one)
3. For subscribed projects with 0 credits: send "credits exhausted" notification email

## Site Nudge

### `POST /api/cron/site-nudge`

Sends re-engagement emails to non-subscribed projects that have site traffic.

**Schedule:** Daily

**Eligibility:**
- Project `status = 'active'`
- `subscription_status = 'none'` (not subscribed)
- `last_nudge_sent_at` is NULL or > 6 days ago

**Logic:**
1. Query eligible projects
2. For each, check `site_analytics` for ≥3 unique visitors in past 7 days
3. If qualified, send re-engagement email via `sendSiteActivityNudge()`
4. Update `projects.last_nudge_sent_at`

## Usage Billing

### `POST /api/cron/usage-billing`

Processes monthly usage-based billing.

**Schedule:** Monthly

**Billing targets:**

1. **Storage Overage** (all projects with website DB):
   - Free tier: `FREE_STORAGE_BYTES` (typically 50MB)
   - Overage: `OVERAGE_CREDITS_PER_100MB` per 100MB block
   - Applied to both subscribed and free projects

2. **Keep-Alive Fee** (non-subscribed projects only):
   - Cost: `MONTHLY_DB_KEEP_ALIVE_CREDITS` (e.g., 1 credit/month)
   - Ensures free projects contribute to DB hosting costs

3. **Expiry Management:**
   - When non-subscribed project hits 0 credits: sets `website_db_expires_at = NOW() + 2 months`
   - Triggers deletion warning sequence

## Deletion Warnings

### `POST /api/cron/deletion-warnings`

Sends warning emails to projects with approaching database deletion.

**Schedule:** Periodic (daily or weekly)

**Logic:** Queries projects where `website_db_expires_at` is approaching and sends graduated warning emails (60 days, 30 days, 7 days before deletion).

## Cleanup Website DBs

### `POST /api/cron/cleanup-website-dbs`

Deletes expired website databases.

**Schedule:** Daily

**Logic:**
1. Query projects where `website_db_expires_at < NOW()`
2. Archive schema to `saved_website_schemas` table (backup)
3. Drop the Neon database
4. Clear `neon_connection_url` from project
