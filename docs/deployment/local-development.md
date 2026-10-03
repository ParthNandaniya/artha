# Local Development

## Prerequisites

- Node.js 20+
- npm
- A Neon database
- Google OAuth credentials
- Postmark account (optional for email features)
- Stripe account (optional for billing features)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env.local` and fill in the values. See [Environment Variables](./environment-variables.md) for the full list.

At minimum you need:
- `DATABASE_URL` — Neon connection string
- `OPENAI_API_KEY` — For AI features
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — For authentication
- `AUTH_SECRET` — Any random string for JWT signing
- `NEXT_PUBLIC_APP_URL=http://localhost:3000`

### 3. Setup Database

```bash
# Validate environment
npx tsx scripts/check-env.ts

# Apply schema to Neon
npx tsx scripts/setup-db.ts

# Verify connection
npx tsx scripts/check-db.ts
```

### 4. Start the App

```bash
# Next.js dev server (terminal 1)
npm run dev

# Background worker (terminal 2 — optional but needed for pipeline/tasks)
npm run worker
```

The app runs at `http://localhost:3000`.

## Development Tips

### Worker

The worker is a separate process that processes background jobs. Without it, pipelines and task execution won't work. Run it in a separate terminal.

### Stripe Testing

Set `STRIPE_USE_TEST_KEYS=true` in `.env.local` to use Stripe test mode. You'll need:
- `STRIPE_SECRET_KEY_TEST`
- `STRIPE_WEBHOOK_SECRET_TEST`

For webhooks in development, use the Stripe CLI:
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

### Postmark Testing

For email testing, you need both Postmark server tokens. See [Postmark Setup](../postmark-setup.md) for configuration details.

Use `POST /api/projects/integrations/test-email` to verify email setup.

### Twitter

Generate a refresh token for the platform Twitter account:
```bash
npx tsx scripts/twitter-platform-token.ts
```

### Database Migrations

Schema changes go in `schema/platform.sql` using idempotent patterns:
```sql
CREATE TABLE IF NOT EXISTS new_table (...);
ALTER TABLE existing_table ADD COLUMN IF NOT EXISTS new_col TYPE;
```

Apply with: `npx tsx scripts/setup-db.ts`

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/setup-db.ts` | Apply platform schema |
| `scripts/check-db.ts` | Validate database connection |
| `scripts/check-env.ts` | Validate environment variables |
| `scripts/check-postmark.ts` | Validate Postmark servers |
| `scripts/twitter-platform-token.ts` | Generate Twitter OAuth token |

## Dev-Only Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /dev/credits` | Add credits to a project |
| `POST /dev/reset-company` | Reset project to initial state |
