# Postmark Integration

Postmark handles all email sending and receiving in Artha.

## Dual-Server Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    POSTMARK SETUP                            │
│                                                              │
│  SERVER 1: PLATFORM                                         │
│  ├─ Token: POSTMARK_PLATFORM_SERVER_TOKEN                   │
│  ├─ Sender: agents@artha.run                                │
│  ├─ Purpose: System emails, digest, nudge, welcome          │
│  └─ Inbound: Receives emails to agents@artha.run            │
│                                                              │
│  SERVER 2: COMPANY                                          │
│  ├─ Token: POSTMARK_COMPANY_SERVER_TOKEN                    │
│  ├─ Sender: {slug}@tryartha.com                             │
│  ├─ Purpose: Company outbound, cold emails                  │
│  └─ Inbound: Receives emails to {slug}@tryartha.com         │
└─────────────────────────────────────────────────────────────┘
```

## Email Flow

### Outbound

```
Application calls sendEmail()
        │
        ├─ Platform email? → Use POSTMARK_PLATFORM_SERVER_TOKEN
        │                     From: agents@artha.run
        │
        └─ Company email?  → Use POSTMARK_COMPANY_SERVER_TOKEN
                              From: {slug}@tryartha.com
        │
        ▼
Postmark API delivers email
```

### Inbound

```
External email sent to agents@artha.run or {slug}@tryartha.com
        │
        ▼
Postmark receives → Triggers webhook
        │
        ▼
POST /api/postmark/inbound
Header: x-postmark-inbound-secret
        │
        ├─ Store raw email in email_inbound
        ├─ Create/update email_threads
        ├─ Route based on sender identity
        │   ├─ Founder → Execute AI task
        │   └─ External → Auto-reply
        └─ Ingest into Supermemory
```

## Email Templates

All templates live in `src/lib/postmark.ts` and use `baseLayout()` for consistent HTML styling:

| Template | Function | Description |
|----------|----------|-------------|
| Welcome | `sendCompanyWelcome()` | Onboarding completion |
| Digest | `sendCompanyDigest()` | Daily task/analytics summary |
| Site Nudge | `sendSiteActivityNudge()` | Re-engagement for traffic |
| Outbound | `sendCompanyOutboundEmail()` | Company cold email |
| Agent Reply | `sendAgentReply()` | AI reply to inbound |
| Credits Exhausted | `sendCreditsExhaustedEmail()` | Credits depleted alert |

## Setup During Pipeline

Pipeline step 10 configures email:

1. Calls `ensureCompanyEmailAddressReady()`
2. Verifies `{slug}@tryartha.com` sender identity on Postmark
3. Configures inbound webhook URL
4. Stores email address in project record

## DNS Requirements

For `tryartha.com`:
- DKIM records (Postmark provides)
- Return-Path record
- MX records for inbound

For `artha.run` (platform email):
- Hostinger mail forwarding → Postmark platform server

## Configuration

| Variable | Description |
|----------|-------------|
| `POSTMARK_PLATFORM_SERVER_TOKEN` | Platform email server token |
| `POSTMARK_COMPANY_SERVER_TOKEN` | Company email server token |
| `POSTMARK_ACCOUNT_TOKEN` | Account-level token (server management) |
| `POSTMARK_INBOUND_WEBHOOK_URL` | Webhook URL for inbound emails |

## File References

| File | Purpose |
|------|---------|
| `src/lib/postmark.ts` | All email templates and send functions |
| `src/lib/platform-email.ts` | Platform-scope helpers |
| `src/lib/email-threads.ts` | Threading logic |
| `src/app/api/postmark/inbound/route.ts` | Inbound webhook |
