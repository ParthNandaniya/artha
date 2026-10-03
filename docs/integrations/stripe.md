# Stripe Integration

Stripe powers all billing in Artha: platform subscriptions, credit packs, and marketplace payments.

## Three Stripe Use Cases

```
┌──────────────────────────────────────────────────────────────┐
│                     STRIPE IN ARTHA                           │
│                                                               │
│  1. PLATFORM SUBSCRIPTION                                    │
│     User → Stripe Checkout → $49/month → Artha              │
│     Gives: 35 credits/month, website DB, nightly tasks       │
│                                                               │
│  2. CREDIT PACKS                                             │
│     User → Stripe Checkout → $25 one-time → Artha           │
│     Gives: 15 additional credits                              │
│                                                               │
│  3. MARKETPLACE (Stripe Connect)                              │
│     Customer → Checkout → Payment → 80% Founder / 20% Artha │
│     Uses: Destination charges via Connect Express accounts    │
└──────────────────────────────────────────────────────────────┘
```

## Webhook Handling

All payment events flow through:

```
POST /api/stripe/webhook
Header: Stripe-Signature (verified)
```

### Event Processing

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Activate subscription or add credits |
| `invoice.paid` | Monthly renewal — add 35 credits |
| `invoice.payment_failed` | Warn user, hibernate website DB |
| `customer.subscription.updated` | Sync period and status |
| `customer.subscription.deleted` | Cancel, hibernate DB |

### Idempotency

Every webhook event is tracked in `stripe_webhook_events` table. Duplicate `event_id` values are skipped.

## Connect (Marketplace)

### Setup Flow

```
Founder creates pricing → AI detects → Auto-provision Connect
        │
        ▼
POST /api/stripe/connect
        │
        ├─ Creates Express Connect account
        ├─ Returns onboarding link
        └─ Founder completes KYC on Stripe
        │
        ▼
users.stripe_connect_account_id = "acct_..."
projects.marketplace_enabled = true
```

### Destination Charges

Customer payments use destination charges:
- Total charge on Artha's Stripe account
- 80% transferred to founder's Connect account
- 20% retained as platform fee
- Stripe processing fees deducted from total

## Configuration

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Live secret key |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature secret |
| `STRIPE_USE_TEST_KEYS` | Toggle test mode (`true`/`false`) |
| `STRIPE_SECRET_KEY_TEST` | Test secret key |
| `STRIPE_WEBHOOK_SECRET_TEST` | Test webhook secret |
| `STRIPE_PRO_PRICE_ID` | Pro subscription price ID |
| `STRIPE_CREDIT_PACK_PRICE_ID` | Credit pack price ID |

## File References

| File | Purpose |
|------|---------|
| `src/lib/stripe.ts` | Client initialization and config |
| `src/lib/project-credits.ts` | Credit operations |
| `src/lib/marketplace.ts` | Marketplace subscriber management |
| `src/app/api/stripe/webhook/route.ts` | Webhook handler |
| `src/app/api/stripe/checkout/route.ts` | Checkout session creation |
| `src/app/api/stripe/connect/route.ts` | Connect onboarding |
