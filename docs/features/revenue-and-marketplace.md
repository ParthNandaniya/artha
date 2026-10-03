# Revenue & Marketplace

Artha enables founders to accept payments from their customers through a built-in marketplace powered by Stripe Connect.

## Two Billing Tracks

Artha has two separate billing systems:

| Track | Purpose | Payer | Recipient |
|-------|---------|-------|-----------|
| **Artha Subscription** | Platform access + credits | Founder | Artha |
| **Marketplace Revenue** | Customer payments | End-customers | Founder (via Artha) |

## Stripe Connect Setup

### Auto-Provisioning

When the AI detects pricing intent (e.g., user says "add a pricing page" or creates pricing plans), it auto-provisions Stripe Connect:

1. Creates Stripe Express Connect account for the founder
2. Stores `stripe_connect_account_id` on user record
3. Founder completes KYC/banking on Stripe's hosted onboarding

### Manual Setup

```
POST /api/stripe/connect
```

Returns Stripe Connect onboarding link.

## Pricing Plans

Founders define their product pricing:

```
project_pricing_plans table:
- name: "Pro Plan"
- price_cents: 2900
- interval: "month" / "year" / "one_time"
- stripe_price_id: "price_..."
- features: ["Feature 1", "Feature 2"]
```

Plans are synced to Stripe via `syncProjectPricingPlans()`.

## Flowchart: Customer Payment Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              MARKETPLACE PAYMENT FLOW                             │
│                                                                   │
│  ┌──────────────┐                                                │
│  │ Customer on  │                                                │
│  │ {slug}.try   │                                                │
│  │ artha.com    │                                                │
│  └──────┬───────┘                                                │
│         │ clicks "Buy"                                           │
│         ▼                                                        │
│  ┌──────────────────────────────┐                                │
│  │ POST /api/site/{slug}/      │                                │
│  │ payments/create-checkout     │                                │
│  └──────────────┬───────────────┘                                │
│                 │                                                 │
│                 ▼                                                 │
│  ┌──────────────────────────────┐                                │
│  │ Stripe Checkout Page         │                                │
│  │ (hosted by Stripe)           │                                │
│  └──────────────┬───────────────┘                                │
│                 │ payment succeeds                                │
│                 ▼                                                 │
│  ┌──────────────────────────────┐                                │
│  │ Stripe Webhook fires         │                                │
│  │ checkout.session.completed   │                                │
│  └──────────────┬───────────────┘                                │
│                 │                                                 │
│         ┌───────┴───────┐                                        │
│         ▼               ▼                                        │
│  ┌─────────────┐ ┌─────────────┐                                │
│  │ 80% to      │ │ 20% to     │                                │
│  │ Founder's   │ │ Artha      │                                │
│  │ Connect     │ │ (platform  │                                │
│  │ account     │ │  fee)      │                                │
│  └─────────────┘ └─────────────┘                                │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────────────────┐                                │
│  │ Record in revenue_           │                                │
│  │ transactions + update        │                                │
│  │ marketplace_subscribers      │                                │
│  └──────────────────────────────┘                                │
└─────────────────────────────────────────────────────────────────┘
```

## Customer Checkout

End-customers purchase through the company's website:

```
POST /api/site/{slug}/payments/create-checkout
Body: { planId, successUrl, cancelUrl }
```

Uses **Stripe destination charges**:
- 80% goes to the founder's Connect account
- 20% is the Artha platform fee

## Revenue Split

| Party | Share | Description |
|-------|-------|-------------|
| Founder | 80% | Deposited to their Connect account |
| Artha | 20% | Platform fee |
| Stripe | ~2.9% + 30¢ | Payment processing (deducted from total) |

Revenue is recorded in `revenue_transactions` table:
- `amount_cents` — Gross payment
- `platform_fee_cents` — Artha's 20% cut
- `net_cents` — Founder's net

## Payouts

### Stripe Connect (Primary)

Funds accumulate in the founder's Connect account. Stripe handles payouts to their bank automatically based on their payout schedule.

### Manual Withdrawal

```
POST /api/revenue/withdraw
```

Request payout from accumulated balance. Founders can also set up PayPal for manual withdrawals via `users.paypal_payout_email`.

## Marketplace Subscribers

End-customers who subscribe are tracked in `marketplace_subscribers` table:
- Linked to the company's project
- Status synced via Stripe webhooks
- Used in morning digest for subscriber stats

## Dashboard UI

- **Revenue panel** (`src/components/panels/revenue-panel.tsx`) — Balance, transaction history, subscriber list
- Shows: total revenue, platform fees, net earnings
- Subscriber management with status and plan details
- Payout/withdrawal controls

## Webhook Handling

Marketplace Stripe events are handled separately from Artha subscription events:

| Event | Action |
|-------|--------|
| `checkout.session.completed` (Connect) | Record income, create subscriber |
| `invoice.paid` (Connect) | Record recurring income |
| `customer.subscription.deleted` (Connect) | Update subscriber status |

All events are idempotent via `stripe_webhook_events` tracking.

## File References

| File | Purpose |
|------|---------|
| `src/lib/stripe.ts` | Stripe client and config |
| `src/lib/marketplace.ts` | Marketplace subscriber management |
| `src/app/api/stripe/webhook/route.ts` | Webhook handler |
| `src/app/api/stripe/connect/route.ts` | Connect setup |
| `src/app/api/revenue/route.ts` | Revenue data |
| `src/app/api/site/[slug]/payments/route.ts` | Customer checkout |
| `src/components/panels/revenue-panel.tsx` | Dashboard UI |
| `src/hooks/use-revenue.ts` | React Query hook |
