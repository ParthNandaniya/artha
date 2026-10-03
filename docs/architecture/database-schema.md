# Database Schema

Artha uses a two-tier database architecture:

1. **Platform DB** — Shared across all users and projects (Neon serverless PostgreSQL)
2. **Company DBs** — Per-project isolated databases for website data (Neon, subscription-gated)

## Platform Database

Schema defined in `schema/platform.sql` using idempotent migrations (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN IF NOT EXISTS`).

### Users & Authentication

#### `users`
Platform user accounts created via Google OAuth.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | User ID |
| email | TEXT UNIQUE | Google email |
| name | TEXT | Display name |
| google_id | TEXT | Google OAuth ID |
| google_data | JSONB | Profile data, user research, supermemory sync map |
| stripe_customer_id | TEXT | Stripe customer ID |
| stripe_connect_account_id | TEXT | Stripe Connect account (for marketplace payouts) |
| paypal_payout_email | TEXT | PayPal withdrawal email |
| created_at | TIMESTAMPTZ | Account creation |

#### `sessions`
Server-side session storage for cookie-based auth.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Session ID |
| user_id | INTEGER FK | References users.id |
| token | TEXT UNIQUE | Session token (stored in httpOnly cookie) |
| expires_at | TIMESTAMPTZ | Session expiry |

### Projects & Companies

#### `projects`
Core project records. One per company, owned by a user.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Project ID |
| user_id | INTEGER FK | Owner |
| name | TEXT | Company name |
| slug | TEXT UNIQUE | URL identifier (`{slug}.tryartha.com`) |
| status | TEXT | `onboarding` / `active` / `paused` |
| subscription_status | TEXT | `none` / `active` / `cancelled` / `past_due` / `trialing` |
| stripe_subscription_id | TEXT | Stripe subscription ID |
| current_period_end | TIMESTAMPTZ | Current billing period end |
| task_credits | NUMERIC(10,1) | Available credits (fractional) |
| neon_connection_url | TEXT | Per-company DB connection string |
| landing_page_html | TEXT | Generated website HTML |
| memory | JSONB | Onboarding metadata (description, url, etc.) |
| company_email | TEXT | `{slug}@tryartha.com` |
| tweet_id | TEXT | Launch tweet ID |
| tweet_url | TEXT | Launch tweet URL |
| marketplace_enabled | BOOLEAN | Whether marketplace payments are active |
| website_db_expires_at | TIMESTAMPTZ | Non-subscribed DB deletion countdown |
| last_nudge_sent_at | TIMESTAMPTZ | Last re-engagement email timestamp |
| created_at | TIMESTAMPTZ | Project creation |

#### `company_profile`
Extended company metadata.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Profile ID |
| project_id | INTEGER FK | References projects.id |
| name | TEXT | Company name |
| tagline | TEXT | One-line description |
| domain | TEXT | Website domain |
| founder_role | TEXT | Founder's role/title |
| industry | TEXT | Industry category |

### Job Queue & Pipeline

#### `job_queue`
Background job queue processed by the worker.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Job ID |
| type | TEXT | `run_pipeline` / `run_task` / `send_digest` / `send_email` / `generate_tasks` |
| status | TEXT | `pending` / `running` / `completed` / `failed` |
| payload | JSONB | Job-specific data |
| project_id | INTEGER | Associated project |
| user_id | INTEGER | Associated user |
| error | TEXT | Error message (if failed) |
| claimed_at | TIMESTAMPTZ | When worker claimed the job |
| completed_at | TIMESTAMPTZ | When job finished |
| created_at | TIMESTAMPTZ | When job was enqueued |

#### `pipeline_events`
Real-time log of onboarding pipeline progress.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Event ID |
| job_id | INTEGER FK | Pipeline job ID |
| project_id | INTEGER | Associated project |
| step | TEXT | Pipeline step name |
| status | TEXT | `running` / `completed` / `failed` |
| log_message | TEXT | Human-readable status |
| log_type | TEXT | `info` / `success` / `error` |
| data | JSONB | Structured event data |
| created_at | TIMESTAMPTZ | Event timestamp |

### Content & Data

#### `tasks`
AI-generated and user-created tasks.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Task ID |
| project_id | INTEGER FK | Owner project |
| title | TEXT | Task title |
| description | TEXT | Task description |
| type | TEXT | `research` / `outreach` / `newsletter` / `custom` |
| status | TEXT | `queued` / `running` / `completed` / `failed` / `pending_confirmation` |
| priority | INTEGER | Sort order |
| credits_cost | NUMERIC(10,1) | Credit cost to execute |
| result | TEXT | Execution result |
| source | TEXT | `user` / `system` / `ai` |
| tags | TEXT[] | Categorization tags |
| is_recurring | BOOLEAN | Whether task recurs nightly |
| job_id | INTEGER | Associated job_queue entry |
| created_at | TIMESTAMPTZ | Creation time |

#### `documents`
Research documents, mission statements, market analyses.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Document ID |
| project_id | INTEGER FK | Owner project |
| title | TEXT | Document title |
| content | TEXT | Document body (markdown) |
| type | TEXT | `mission` / `market_research` / `research` / `custom` |
| metadata | JSONB | Structured data (tags, sources, etc.) |
| created_at | TIMESTAMPTZ | Creation time |

#### `chat_messages`
Dashboard chat conversation history.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Message ID |
| project_id | INTEGER FK | Project context |
| role | TEXT | `user` / `assistant` / `system` |
| content | TEXT | Message body |
| metadata | JSONB | Source info, credit cost, agent used |
| created_at | TIMESTAMPTZ | Timestamp |

#### `pages`
Published website pages.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Page ID |
| project_id | INTEGER FK | Owner project |
| slug | TEXT | Page URL path |
| title | TEXT | Page title |
| html | TEXT | Full HTML content |
| published | BOOLEAN | Whether page is live |
| created_at | TIMESTAMPTZ | Creation time |

#### `memory`
Per-project key-value store for structured context.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Entry ID |
| project_id | INTEGER FK | Owner project |
| key | TEXT | Memory key (e.g., `companyName`, `mission`) |
| value | TEXT | Memory value |
| created_at | TIMESTAMPTZ | Creation time |

### Email

#### `email_threads`
Email conversation threading for company inboxes.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Thread ID |
| project_id | INTEGER FK | Owner project |
| subject | TEXT | Thread subject |
| from_email | TEXT | Original sender |
| last_message_at | TIMESTAMPTZ | Most recent message |
| unread | BOOLEAN | Has unread messages |

#### `email_messages`
Individual messages within threads.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Message ID |
| thread_id | INTEGER FK | Parent thread |
| project_id | INTEGER FK | Owner project |
| direction | TEXT | `inbound` / `outbound` |
| from_email | TEXT | Sender |
| to_email | TEXT | Recipient |
| subject | TEXT | Subject line |
| html_body | TEXT | HTML content |
| message_id | TEXT | Postmark message ID |
| created_at | TIMESTAMPTZ | Timestamp |

#### `email_inbound`
Raw inbound emails received via Postmark webhook.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Entry ID |
| project_id | INTEGER | Associated project |
| from_email | TEXT | Sender |
| to_email | TEXT | Recipient address |
| subject | TEXT | Subject |
| text_body | TEXT | Plain text body |
| html_body | TEXT | HTML body |
| message_id | TEXT | Postmark message ID |
| created_at | TIMESTAMPTZ | Receipt time |

#### `platform_email_threads` / `platform_email_messages`
Email conversations at the platform level (`agents@artha.run`).

### Analytics

#### `site_analytics`
Visitor tracking events for company websites.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Event ID |
| project_id | INTEGER FK | Owner project |
| event | TEXT | `pageview` / `pageview_end` / `click` / `custom` |
| path | TEXT | Page path |
| visitor_id | TEXT | Persistent visitor identifier |
| session_id | TEXT | Session identifier |
| referrer | TEXT | Traffic source |
| user_agent | TEXT | Browser user agent |
| screen_width | INTEGER | Viewport width |
| duration_ms | INTEGER | Engagement time (for pageview_end) |
| metadata | JSONB | Extra event data |
| created_at | TIMESTAMPTZ | Event timestamp |

### Billing & Revenue

#### `subscriptions`
Stripe subscription records.

#### `stripe_webhook_events`
Idempotency tracking for Stripe webhooks.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Entry ID |
| event_id | TEXT UNIQUE | Stripe event ID |
| event_type | TEXT | Stripe event type |
| processed_at | TIMESTAMPTZ | When processed |

#### `project_pricing_plans`
Marketplace pricing tiers set by founders.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Plan ID |
| project_id | INTEGER FK | Owner project |
| name | TEXT | Plan name |
| price_cents | INTEGER | Price in cents |
| interval | TEXT | `month` / `year` / `one_time` |
| stripe_price_id | TEXT | Stripe Price ID |
| features | JSONB | Plan features list |
| active | BOOLEAN | Whether plan is available |

#### `marketplace_subscribers`
End-customers who purchased via a company's site.

#### `revenue_transactions`
Income and payout records.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Transaction ID |
| project_id | INTEGER FK | Owner project |
| type | TEXT | `income` / `withdrawal` |
| amount_cents | INTEGER | Gross amount |
| platform_fee_cents | INTEGER | Artha's 20% cut |
| net_cents | INTEGER | Founder's net |
| stripe_payment_id | TEXT | Stripe payment reference |
| created_at | TIMESTAMPTZ | Transaction time |

### Leads & Contacts

#### `leads`
Sales leads discovered by AI or added manually.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Lead ID |
| project_id | INTEGER FK | Owner project |
| name | TEXT | Contact name |
| email | TEXT | Email address |
| company | TEXT | Company name |
| title | TEXT | Job title |
| score | INTEGER | Lead quality score |
| status | TEXT | `new` / `contacted` / `qualified` / `converted` |
| source | TEXT | How lead was found |
| notes | TEXT | Notes |
| contacted | BOOLEAN | Whether outreach was sent |
| contacted_at | TIMESTAMPTZ | When contacted |

#### `contacts`
Form submissions from company websites.

#### `forms` / `form_submissions`
Website form definitions and their submissions.

### Other

#### `tweets`
Generated and posted tweets.

#### `ad_campaigns`
Ad campaign records (Meta Ads).

#### `research_tags`
Categorization tags for research documents.

#### `waitlist_signups`
Pre-launch waitlist entries.

## Per-Company Database

Each subscribed project gets an isolated Neon database. Schema is initialized by `initCompanySchema()` in the pipeline processor.

### Default Tables

#### `site_users`
End-users of the company's website.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | User ID |
| email | TEXT UNIQUE | User email |
| password_hash | TEXT | bcrypt hash |
| name | TEXT | Display name |
| email_verified | BOOLEAN | Email verification status |
| verification_token | TEXT | Email verification token |
| credits | NUMERIC(10,1) | User credit balance |
| created_at | TIMESTAMPTZ | Registration time |

### Dynamic Tables

The AI database manager agent can create additional tables based on the company's needs (e.g., `products`, `orders`, `bookings`). These are managed through the website builder and chat interface.

## Key Database Functions

### `decrement_task_credits(project_id, amount)`
Atomically reduces `projects.task_credits` with bounds checking. Returns the new balance. Prevents negative credits.

## Schema Migration Strategy

All migrations are idempotent:
- Tables: `CREATE TABLE IF NOT EXISTS`
- Columns: `ALTER TABLE ADD COLUMN IF NOT EXISTS`
- Indexes: `CREATE INDEX IF NOT EXISTS`

Run migrations via `npm run setup-db` which executes `scripts/setup-db.ts` against the platform database.
