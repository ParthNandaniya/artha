# Postmark Setup

This app has two different email jobs. They should not share the same setup blindly.

## 1. Email model

### Routing summary

| Surface | Address pattern | Receiving service | Delivery method | Sending service |
| --- | --- | --- | --- | --- |
| Platform founder inbox | `agents@artha.run` | Hostinger | Hostinger forwarder -> Postmark platform inbound stream -> `/api/postmark/inbound` | Postmark `Artha Platform` |
| Company inboxes | `{slug}@tryartha.com` | Postmark | `tryartha.com` MX -> Postmark company inbound stream -> `/api/postmark/inbound` | Postmark `Artha Company Mail` |
| Company websites | `{slug}.tryartha.com` | Cloudflare Pages | Cloudflare Pages custom domain | N/A |

### Service ownership

```mermaid
flowchart LR
    Founder["Founder or external sender"]

    subgraph PlatformMail["Platform email path"]
      Hostinger["Hostinger\nagents@artha.run"]
      PlatformPostmark["Postmark\nArtha Platform"]
      App["Artha app\n/api/postmark/inbound"]
    end

    subgraph CompanyMail["Company email path"]
      CompanyPostmark["Postmark\nArtha Company Mail"]
      CompanyApp["Artha app\n/api/postmark/inbound"]
    end

    subgraph Website["Website path"]
      Cloudflare["Cloudflare Pages\n{slug}.tryartha.com"]
    end

    Founder --> Hostinger --> PlatformPostmark --> App
    Founder --> CompanyPostmark --> CompanyApp
    Founder --> Cloudflare
```

### Platform mail

Use `agents@artha.run` for Artha-originated email:

- welcome email
- billing / credits / lifecycle email
- agent replies to the founder
- daily digest to the founder
- AI-driven inbound at `agents@artha.run`

Recommended Postmark server: `Artha Platform`

### Company mail

Use `{slug}@tryartha.com` for each generated company:

- outbound replies to customers
- inbound mail from customers
- direct company email from the dashboard

Recommended Postmark server: `Artha Company Mail`

The website subdomain (`{slug}.tryartha.com`) and the email address (`{slug}@tryartha.com`) are separate DNS concerns. The website wildcard can point to Cloudflare Pages while the root/apex `tryartha.com` still holds the MX/TXT/CNAME records for mail.

## 1.5. Visual overview

### Domain and server split

```mermaid
flowchart LR
    App["Artha app"]

    subgraph DNS["DNS and domains"]
      Artha["artha.run"]
      Try["tryartha.com"]
      Site["{slug}.tryartha.com website"]
    end

    subgraph Postmark["Postmark"]
      Platform["Artha Platform server"]
      Company["Artha Company Mail server"]
    end

    Cloudflare["Cloudflare Pages"]

    App --> Platform
    App --> Company
    Artha --> Platform
    Try --> Company
    Site --> Cloudflare
```

### Outbound flow

```mermaid
flowchart LR
    Trigger["App event or worker job"] --> Mailer["src/lib/postmark.ts"]

    Mailer -->|"Welcome, billing, founder replies, digests"| Platform["Postmark platform server"]
    Mailer -->|"Founder composes company email in dashboard, customer replies, company mail"| Company["Postmark company server"]

    Platform --> Founder["Founder inbox"]
    Company --> External["Customer or lead inbox"]
```

### Inbound flow for `{slug}@tryartha.com`

```mermaid
flowchart TB
    Sender["External sender or founder"] --> Address["{slug}@tryartha.com"]
    Address --> MX["MX for tryartha.com"]
    MX --> Postmark["Postmark company inbound"]
    Postmark --> Webhook["POST /api/postmark/inbound?secret=***"]
    Webhook --> Secret["Validate inbound secret"]
    Secret --> Project["Match recipient slug to project"]
    Project --> Store["Store in email_inbound and memory"]
    Store --> Branch{"Founder email?"}
    Branch -->|"Yes"| FounderFlow["Route to orchestrator and send agent reply"]
    Branch -->|"No"| ExternalFlow["Generate company reply from {slug}@tryartha.com"]
```

### Platform inbound flow for `agents@artha.run`

```mermaid
flowchart TB
    Founder["Founder emails agents@artha.run"] --> Hostinger["Hostinger mailbox / forwarder"]
    Hostinger --> PlatformPostmark["Postmark platform inbound address"]
    PlatformPostmark --> Webhook["POST /api/postmark/inbound?secret=***"]
    Webhook --> Identify["Match sender email to user"]
    Identify --> Decision{"Known user?"}
    Decision -->|"No"| LeadReply["Send signup CTA and store as external lead"]
    Decision -->|"Yes"| ProjectDecision{"Project known?"}
    ProjectDecision -->|"One project or project named in email"| Routed["Route directly to that project"]
    ProjectDecision -->|"Multiple projects and unclear"| Clarify["Ask founder which project they mean"]
    Clarify --> Reply["Founder replies with slug or project name"]
    Reply --> Routed
    Routed --> Orchestrator["Execute with same project context as {slug}@tryartha.com"]
```

## 2. Required env

Add these env vars locally and in production:

```bash
# Platform mail
POSTMARK_PLATFORM_SERVER_TOKEN=...
POSTMARK_PLATFORM_SERVER_ID=12345678
POSTMARK_PLATFORM_MESSAGE_STREAM=outbound
POSTMARK_PLATFORM_BROADCAST_MESSAGE_STREAM=broadcasts

# Company mail
POSTMARK_COMPANY_SERVER_TOKEN=...
POSTMARK_COMPANY_SERVER_ID=23456789
POSTMARK_COMPANY_MESSAGE_STREAM=outbound
POSTMARK_COMPANY_BROADCAST_MESSAGE_STREAM=broadcasts

# Optional but recommended for diagnostics/readiness checks
POSTMARK_ACCOUNT_TOKEN=...

# Inbound webhook protection
POSTMARK_INBOUND_WEBHOOK_SECRET=...

# Optional local-dev override when Postmark should keep calling production
# Example: https://artha.run/api/postmark/inbound
POSTMARK_INBOUND_WEBHOOK_URL=
```

Legacy fallback:

```bash
# Only if you intentionally use one Postmark server for everything
POSTMARK_SERVER_TOKEN=...
```

Local development note:

- keep `NEXT_PUBLIC_APP_URL=http://localhost:3000` for your local app
- if the shared Postmark inbound stream remains pointed at production, set `POSTMARK_INBOUND_WEBHOOK_URL` locally to the live `/api/postmark/inbound` endpoint so "Set up email" validates against production instead of localhost
- if you need inbound requests to hit your laptop, expose the local app with a tunnel and point Postmark at that tunnel instead

## 3. Postmark dashboard setup

### Setup sequence

```mermaid
flowchart TD
    A["Create Postmark platform server"] --> B["Verify artha.run"]
    B --> C["Set platform inbound webhook URL with secret"]
    C --> D["Forward agents@artha.run to the Postmark inbound address"]
    D --> E["Create Postmark company server"]
    E --> F["Verify tryartha.com"]
    F --> G["Set company inbound domain: tryartha.com"]
    G --> H["Reuse the same shared inbound webhook URL"]
    H --> I["Copy server tokens and server ids into env"]
    I --> J["Deploy env to web and worker"]
    J --> K["Run npm run postmark:check"]
    K --> L["Send test outbound and inbound emails"]
```

### Server A: platform mail

1. Create a server named `Artha Platform`.
2. Verify `artha.run` as a sending domain on that server, or at minimum confirm `agents@artha.run` as a sender signature.
3. Configure inbound on that same server:
   - inbound webhook URL: `https://YOUR_APP_DOMAIN/api/postmark/inbound?secret=YOUR_SECRET`
   - copy the generated Postmark inbound address from the inbound stream
4. In Hostinger or your current mailbox provider for `artha.run`, create a forwarder from `agents@artha.run` to that Postmark inbound address.
5. Copy:
   - server token -> `POSTMARK_PLATFORM_SERVER_TOKEN`
   - server id -> `POSTMARK_PLATFORM_SERVER_ID`

Important:

- do not set the root `artha.run` MX to Postmark unless you want all `@artha.run` inbound mail handled there
- the platform server can work without a Postmark inbound domain when Hostinger forwards only `agents@artha.run`

### Server B: company mail

1. Create a server named `Artha Company Mail`.
2. Verify `tryartha.com` as a sending domain on that server.
3. Configure inbound on that same server:
   - inbound domain: `tryartha.com`
   - inbound webhook URL: `https://YOUR_APP_DOMAIN/api/postmark/inbound?secret=YOUR_SECRET`
4. Copy:
   - server token -> `POSTMARK_COMPANY_SERVER_TOKEN`
   - server id -> `POSTMARK_COMPANY_SERVER_ID`

## 4. DNS you need to add

### For `artha.run`

Add the DNS records Postmark gives you for the platform server:

- DKIM record(s)
- Return-Path CNAME
- any sender-signature verification record if you use only `agents@artha.run`

Do not switch the root MX for `artha.run` to Postmark if normal inboxes like `parth@artha.run` should stay on Hostinger.

### For `tryartha.com`

Add the DNS records Postmark gives you for the company server:

- DKIM record(s)
- Return-Path CNAME
- MX record for inbound mail at `tryartha.com`

Important: this inbound MX is what lets `hello@tryartha.com` style addresses receive mail inside Postmark. Without it, outbound may work but inbound will not.

### DNS and mail ownership

```mermaid
flowchart TB
    subgraph ArthaRun["artha.run"]
      ArthaDNS["DNS: Hostinger mail + Postmark sender records"]
      Agents["agents@artha.run"]
      Parth["parth@artha.run"]
    end

    subgraph TryArtha["tryartha.com"]
      TryDNS["DNS: Postmark DKIM/Return-Path/MX"]
      SlugMail["{slug}@tryartha.com"]
      SlugSite["{slug}.tryartha.com"]
    end

    ArthaDNS --> Agents
    ArthaDNS --> Parth
    TryDNS --> SlugMail
    SlugSite --> Cloudflare["Cloudflare Pages"]
```

## 5. How Artha uses it

Current runtime behavior:

- platform emails send through the platform Postmark server
- platform inbound for `agents@artha.run` goes through your mailbox provider's forwarder into the platform Postmark inbound stream
- company emails send through the company Postmark server
- inbound company mail lands on `/api/postmark/inbound`
- inbound requests are rejected unless the webhook secret matches
- Postmark is the transport and inbound parser, while Artha stores inbound thread state in its own database

Important distinction:

- founder updates from Artha always come from `agents@artha.run`
- company-facing mail from the Email panel or auto-replies goes out as `{slug}@tryartha.com`
- the phrase "dashboard sends" means the founder is using the dashboard to send as their company, not Artha sending platform updates
- if a founder emails bare `agents@artha.run` and has multiple projects, Artha asks which project they mean before routing
- once the founder picks a project, the request is executed with the same project context as `{slug}@tryartha.com`

The onboarding step `create email address` does not provision per-user inboxes inside Postmark. It validates that the shared `tryartha.com` company mail setup is ready, then stores `{slug}@tryartha.com` on the project.

### Professional Email Layout
- All Artha-sent emails use a consistent **Professional Layout** defined in `src/lib/postmark.ts#baseLayout`.
- Design features: 12px rounded cards, Syne display font for branding, and subtle shadows.
- **Footer:** Includes a link to the `@tryarthaHQ` X handle for social proof and platform discoverability.


Storage model:

- `agents@artha.run` inbound threads are stored in platform tables `platform_email_threads` and `platform_email_messages`
- `{slug}@tryartha.com` inbound mail is stored in the company database `email_inbound` table for that project
- your Email tab should read from Artha's database, not from Postmark

### Future operator mental model

- Hostinger owns normal `@artha.run` mailbox routing
- Postmark platform owns outbound founder mail and inbound mail that Hostinger forwards from `agents@artha.run`
- Postmark company owns both outbound and inbound for `{slug}@tryartha.com`
- Cloudflare Pages owns `{slug}.tryartha.com` websites only; it does not handle company email

## 6. Verification commands

Run these after env and DNS are in place:

```bash
npm run env:check
npm run postmark:check
```

`postmark:check` verifies:

- platform token works
- company token works
- optional account-level server/domain wiring
- expected inbound webhook URL for company mail

## 7. Production checklist

1. Put all Postmark env vars on the web service.
2. Mirror the same mail env vars to the worker service.
3. Set the inbound webhook in Postmark to the production URL, not localhost.
4. Re-run `npm run postmark:check` against production env.
5. Send one real platform email and one real company email.
6. Email one `{slug}@tryartha.com` address from an external inbox and confirm it reaches `/api/postmark/inbound`.

## 8. Important limitations

### Trial / approval

If the Postmark account is still in trial or pending approval, sending to external recipient domains may be blocked. Finish Postmark approval first.

### Broadcast vs transactional

Use transactional streams for:

- welcome
- receipts / billing
- passwordless / auth
- replies
- digests

Use broadcast streams for:

- re-engagement campaigns
- newsletters
- any email that needs unsubscribe behavior

If you plan to do true cold outbound prospecting at scale, Postmark is usually the wrong provider. Keep Postmark for product and customer mail, and use a dedicated outreach provider for unsolicited outbound.
