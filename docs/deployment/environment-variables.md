# Environment Variables

All required environment variables for running Artha.

## Database & Cloud

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon platform DB connection string |
| `NEON_API_KEY` | Yes | Neon API key for creating per-company databases |
| `NEON_ORG_ID` | Yes | Neon organization ID |

## AI & LLM

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key (primary AI provider) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key (backup/specific agents) |
| `TAVILY_API_KEY_DEV` | Dev | Tavily web search (development) |
| `TAVILY_API_KEY_PROD` | Prod | Tavily web search (production) |

## Authentication

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth app client secret |
| `AUTH_SECRET` | Yes | JWT signing key (generate a random 32+ char string) |

## Email (Postmark)

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTMARK_PLATFORM_SERVER_TOKEN` | Yes | Platform email server (agents@artha.run) |
| `POSTMARK_COMPANY_SERVER_TOKEN` | Yes | Company email server ({slug}@tryartha.com) |
| `POSTMARK_ACCOUNT_TOKEN` | Yes | Account-level token for server management |
| `POSTMARK_INBOUND_WEBHOOK_URL` | Yes | Webhook URL for receiving inbound emails |

## Payments (Stripe)

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | Yes | Live Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Webhook signature verification secret |
| `STRIPE_PRO_PRICE_ID` | Yes | Stripe Price ID for Pro subscription ($49/mo) |
| `STRIPE_CREDIT_PACK_PRICE_ID` | Yes | Stripe Price ID for credit pack ($25) |
| `STRIPE_USE_TEST_KEYS` | No | Set to `true` to use test keys in development |
| `STRIPE_SECRET_KEY_TEST` | Dev | Test mode secret key |
| `STRIPE_WEBHOOK_SECRET_TEST` | Dev | Test mode webhook secret |

## Twitter/X

| Variable | Required | Description |
|----------|----------|-------------|
| `TWITTER_CLIENT_ID` | No | OAuth 2.0 app ID |
| `TWITTER_CLIENT_SECRET` | No | OAuth 2.0 app secret |
| `TWITTER_REDIRECT_URI` | No | OAuth callback URL |

Production uses `TWITTER_*` keys; development can use `TWITTER_TEST_*` variants.

## Cloud & Hosting

| Variable | Required | Description |
|----------|----------|-------------|
| `CLOUDFLARE_ACCOUNT_ID` | No | Cloudflare account (for Pages hosting) |
| `CLOUDFLARE_API_TOKEN` | No | Cloudflare API token with Pages permissions |
| `GITHUB_TOKEN` | No | GitHub PAT for creating company repos |

## App Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_APP_URL` | Yes | App root URL (`http://localhost:3000` or `https://artha.run`) |
| `NEXT_PUBLIC_APP_DOMAIN` | Yes | App domain (`artha.run`) |
| `NEXT_PUBLIC_COMPANY_DOMAIN` | Yes | Company site domain (`tryartha.com`) |
| `NEXT_PUBLIC_POSTHOG_KEY` | No | PostHog analytics key (artha.run tracking) |

## Memory

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPERMEMORY_API_KEY` | Yes | Supermemory API key for semantic context |

## Cron

| Variable | Required | Description |
|----------|----------|-------------|
| `CRON_SECRET` | Yes | Bearer token for scheduled job endpoints |

## Worker

| Variable | Required | Description |
|----------|----------|-------------|
| `WORKER_CONCURRENCY` | No | Number of worker threads (default: 2) |
| `WORKER_POLL_INTERVAL` | No | Poll interval in ms (default: 2000) |

## Example `.env.local`

```bash
# Database
DATABASE_URL=postgresql://user:pass@host/artha
NEON_API_KEY=neon_...
NEON_ORG_ID=org_...

# AI
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
TAVILY_API_KEY_DEV=tvly-...

# Auth
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
AUTH_SECRET=your-random-secret-here

# Email
POSTMARK_PLATFORM_SERVER_TOKEN=...
POSTMARK_COMPANY_SERVER_TOKEN=...
POSTMARK_ACCOUNT_TOKEN=...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_CREDIT_PACK_PRICE_ID=price_...
STRIPE_USE_TEST_KEYS=true

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_DOMAIN=localhost
NEXT_PUBLIC_COMPANY_DOMAIN=tryartha.com

# Memory
SUPERMEMORY_API_KEY=...

# Cron
CRON_SECRET=your-cron-secret
```
