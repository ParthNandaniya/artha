# Billing API

Stripe-powered billing for subscriptions, credit packs, and marketplace revenue.

## Flowchart: Subscription Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│              SUBSCRIPTION LIFECYCLE                               │
│                                                                   │
│  ┌──────────┐     ┌───────────┐     ┌──────────────┐           │
│  │  FREE    │────▶│ CHECKOUT  │────▶│   ACTIVE     │           │
│  │  (0 cr)  │     │ ($49/mo)  │     │  (35 cr/mo)  │           │
│  └──────────┘     └───────────┘     └──────┬───────┘           │
│                                             │                    │
│                           ┌─────────────────┼─────────────┐     │
│                           │                 │             │     │
│                           ▼                 ▼             ▼     │
│                   ┌──────────────┐ ┌─────────────┐ ┌─────────┐│
│                   │ RENEWAL      │ │ PAYMENT     │ │ CANCEL  ││
│                   │ (monthly)    │ │ FAILED      │ │         ││
│                   │              │ │             │ │         ││
│                   │ +35 credits  │ │ Warn user   │ │Hibernate││
│                   │ Reset period │ │ Hibernate DB│ │ DB      ││
│                   └──────────────┘ └─────────────┘ └─────────┘│
│                                                                   │
│  CREDIT PACKS (available anytime):                               │
│  ┌─────────────────────────────────┐                             │
│  │ $25 one-time → +15 credits     │                             │
│  │ Stack with subscription credits │                             │
│  └─────────────────────────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

## Checkout

### `POST /api/stripe/checkout`

Create a Stripe Checkout session for Pro subscription.

**Auth:** Required

**Body:**
```json
{ "projectId": 1 }
```

**Behavior:**
1. Creates Stripe customer if user doesn't have one
2. Creates Checkout session for Pro plan ($49/month)
3. Success URL: `/dashboard/{slug}?subscribed=true`

**Response:**
```json
{ "url": "https://checkout.stripe.com/..." }
```

### `POST /api/stripe/credit-pack`

Purchase a one-time credit pack ($25 for 15 credits).

**Auth:** Required

**Body:**
```json
{ "projectId": 1 }
```

### `GET /api/stripe/billing-portal`

Redirect to Stripe Customer Portal for subscription management.

### `GET /api/stripe/payment-method`

Get the user's saved payment method.

## Stripe Connect

### `POST /api/stripe/connect`

Initiate Stripe Connect onboarding for marketplace revenue.

**Auth:** Required

**Behavior:**
1. Creates Stripe Express Connect account
2. Returns onboarding link
3. Founder completes KYC/banking setup on Stripe

## Webhook

### `POST /api/stripe/webhook`

Receives Stripe events. **No auth** — verified via `Stripe-Signature` header.

### Handled Events

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Activate subscription, add credits (35/month, 40 first), provision website DB |
| `invoice.paid` | Monthly renewal — add 35 credits, update `current_period_end` |
| `invoice.payment_failed` | Send warning email, hibernate website DB |
| `customer.subscription.updated` | Sync period and status |
| `customer.subscription.paused` | Update status |
| `customer.subscription.resumed` | Restore status and website DB |
| `customer.subscription.deleted` | Cancel subscription, hibernate website DB |

### Marketplace Events (Connect)

Stripe Connect events for end-customer payments:
- Record revenue in `revenue_transactions`
- Update `marketplace_subscribers`
- Split: 80% to founder, 20% platform fee

### Idempotency

All webhook events are tracked in `stripe_webhook_events` table. Duplicate `event_id` values are skipped to prevent double-processing.

## Credit System

### Pricing

| Plan | Price | Credits |
|------|-------|---------|
| Free | $0 | 0 (onboarding only) |
| Pro | $49/month | 35/month (40 first month) |
| Credit Pack | $25 one-time | 15 |

### Credit Costs

| Agent | Cost |
|-------|------|
| Chat (direct answer) | 0.1 |
| AI Enhance (form field) | 0.2 |
| Task Generate (lightweight) | 0.2 |
| Twitter | 0.5 |
| Email Writer | 0.5 |
| Task Generator | 0.5 |
| Database Manager | 1.0 |
| Stripe Agent | 1.0 |
| Website Builder | 1.5 |
| Research | 1.5 |
| Lead Finder | 1.5 |

Credits are stored in `projects.task_credits` as `NUMERIC(10,1)` for fractional values. Deducted atomically via `decrement_task_credits()` SQL function.

### Credit Stacking

Credits from subscriptions and packs stack into a single pool. There is no expiry tracking — unused credits carry over.
