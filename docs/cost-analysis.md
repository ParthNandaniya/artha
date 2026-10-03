# Artha — AI Cost & Pricing Strategy Analysis

**Date:** March 10, 2026
**Scope:** Per-user AI cost modeling, model selection strategy, and pricing model alternatives

---

## 1. Executive Summary

Artha currently uses **GPT-4o** for all AI operations. This document models costs if we switched to **Claude Opus 4.6** (the best model), compares all model options, and recommends a pricing strategy inspired by how Cursor and Claude handle usage.

**Key finding:** Even using Opus 4.6 for *everything*, our AI cost per $49/mo subscriber is **~$3-11/month** depending on usage intensity. Margins remain 77-94%. The real risk isn't model cost — it's heavy users on the free tier and poorly gated non-credit API calls (intent classification, form enhancements).

---

## 2. Current API Pricing (March 2026)

| Model | Input (per 1M tokens) | Output (per 1M tokens) | Relative Cost |
|-------|----------------------|------------------------|---------------|
| **Claude Opus 4.6** | $5.00 | $25.00 | 2x GPT-4o |
| **Claude Sonnet 4.6** | $3.00 | $15.00 | 1.2x GPT-4o |
| **GPT-4o** (current) | $2.50 | $10.00 | 1x (baseline) |
| **Claude Haiku 4.5** | $1.00 | $5.00 | 0.4x GPT-4o |
| **GPT-4o-mini** | $0.15 | $0.60 | 0.06x GPT-4o |

**Cost-saving options available:**
- Batch API: 50% off (for async workloads like nightly tasks, pipeline)
- Prompt caching: 90% off input for repeated system prompts (huge for us — same agent prompts reused constantly)

Sources: [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing), [OpenAI Pricing](https://openai.com/api/pricing/)

---

## 3. Token Usage Per Operation (Estimated)

Based on codebase analysis of all AI calls:

| Operation | Input Tokens | Output Tokens | API Calls | Credit Cost |
|-----------|-------------|---------------|-----------|-------------|
| **Onboarding Pipeline** | | | | |
| User research | ~2,500 | ~1,000 | 1 | Free |
| Idea research + web search | ~2,500 | ~1,500 | 1 | Free |
| Name company | ~500 | ~100 | 1 | Free |
| Mission document | ~2,000 | ~1,500 | 1 | Free |
| Market research | ~7,000 | ~3,000 | 2 | Free |
| Landing page content | ~3,000 | ~2,000 | 1 | Free |
| Task queue generation | ~1,800 | ~800 | 1 | Free |
| Tweet composition | ~1,500 | ~300 | 1 | Free |
| **Pipeline total** | **~25,000** | **~12,000** | **10-12** | **Free** |
| | | | | |
| **Per-Credit Operations** | | | | |
| Intent classification | ~2,500 | ~500 | 1 | Free (no credit) |
| Agent execution (avg) | ~2,500 | ~1,500 | 1 | 1 credit |
| **Per chat message total** | **~5,000** | **~2,000** | **2** | **1 credit** |
| | | | | |
| **Non-Credit Operations** | | | | |
| Form enhancement (AI button) | ~1,000 | ~300 | 1 | Free |
| Task generation (dashboard) | ~1,000 | ~500 | 1 | Free |
| Inbound email classification | ~2,000 | ~500 | 1 | Free |

---

## 4. Cost Per User — Onboarding (Free Tier)

Every user gets a full onboarding pipeline for free. This is our acquisition cost.

| Model | Input Cost | Output Cost | **Total per Onboarding** |
|-------|-----------|-------------|--------------------------|
| GPT-4o (current) | $0.063 | $0.120 | **$0.18** |
| Opus 4.6 | $0.125 | $0.300 | **$0.43** |
| Sonnet 4.6 | $0.075 | $0.180 | **$0.26** |
| Haiku 4.5 | $0.025 | $0.060 | **$0.09** |

**With Batch API (50% off)** — pipeline is async, perfect for batch:

| Model | **Batch Onboarding Cost** |
|-------|--------------------------|
| GPT-4o | **$0.09** |
| Opus 4.6 | **$0.21** |
| Sonnet 4.6 | **$0.13** |
| Haiku 4.5 | **$0.04** |

**With Prompt Caching** (system prompts cached, 90% input savings):
- Opus 4.6 onboarding drops to ~$0.33 (cache saves ~$0.10 on input)
- Combined with batch: ~$0.17

**Verdict:** Even Opus 4.6 onboarding costs **$0.17-0.43** per user. At 1,000 free signups/month, that's $170-$430. Very manageable.

---

## 5. Cost Per Subscribed User ($49/month)

### 5a. Typical Subscriber (uses ~35 credits/month)

Breakdown: 30 nightly auto-tasks + 5 manual tasks. Plus ~50 chat messages (intent classification free but costs API $) and ~20 form enhancements.

| Component | Calls/mo | GPT-4o | Opus 4.6 | Sonnet 4.6 | Haiku 4.5 |
|-----------|----------|--------|----------|------------|-----------|
| Onboarding (1-time, amortized) | — | $0.01 | $0.02 | $0.01 | $0.00 |
| Nightly tasks (30) | 30 | $0.99 | $2.25 | $1.35 | $0.45 |
| Manual tasks (5) | 5 | $0.17 | $0.38 | $0.23 | $0.08 |
| Intent classification (50) | 50 | $0.47 | $1.25 | $0.68 | $0.18 |
| Form enhancements (20) | 20 | $0.08 | $0.19 | $0.11 | $0.04 |
| Morning digest email | 0 | $0.00 | $0.00 | $0.00 | $0.00 |
| **Monthly Total** | **~105** | **$1.72** | **$4.09** | **$2.38** | **$0.75** |
| **Margin on $49** | | **96.5%** | **91.7%** | **95.1%** | **98.5%** |

*Note: Morning digest and site nudge emails use HTML templates, not AI generation — zero AI cost.*

### 5b. Heavy Subscriber (power user, buys credit packs)

This user maxes out: 30 nightly tasks, 20 manual tasks (buys credit pack), 100 chat messages, 50 form enhancements.

| Component | Calls/mo | GPT-4o | Opus 4.6 | Sonnet 4.6 | Haiku 4.5 |
|-----------|----------|--------|----------|------------|-----------|
| Nightly tasks (30) | 30 | $0.99 | $2.25 | $1.35 | $0.45 |
| Manual tasks (20) | 20 | $0.66 | $1.50 | $0.90 | $0.30 |
| Intent classification (100) | 100 | $0.93 | $2.50 | $1.35 | $0.35 |
| Agent executions (60) | 60 | $1.98 | $4.50 | $2.70 | $0.90 |
| Form enhancements (50) | 50 | $0.20 | $0.63 | $0.28 | $0.10 |
| **Monthly Total** | **~260** | **$4.76** | **$11.38** | **$6.58** | **$2.10** |
| **Revenue** ($49 + $25 pack) | | $74 | $74 | $74 | $74 |
| **Margin** | | **93.6%** | **84.6%** | **91.1%** | **97.2%** |

### 5c. Extreme Edge Case (someone trying to abuse the system)

200 chat messages/day = 6,000/month with complex multi-agent tasks.

| Model | Monthly AI Cost | Revenue | Margin |
|-------|----------------|---------|--------|
| GPT-4o | ~$30 | $49 | 38.8% |
| Opus 4.6 | ~$72 | $49 | **-47% (LOSS)** |
| Sonnet 4.6 | ~$42 | $49 | 14.3% |
| Haiku 4.5 | ~$13 | $49 | 73.5% |

**This is why we need rate limiting and/or usage caps** (see Section 8).

---

## 6. Cost if We Use Opus 4.6 for EVERYTHING

### At scale projections:

| Users | Free (onboarding only) | Subscribers (typical) | Total Monthly AI Cost |
|-------|----------------------|----------------------|----------------------|
| 100 free + 20 subs | $43 | $82 | **$125** |
| 500 free + 100 subs | $215 | $409 | **$624** |
| 1,000 free + 300 subs | $430 | $1,227 | **$1,657** |
| 5,000 free + 1,000 subs | $2,150 | $4,090 | **$6,240** |

Revenue at 1,000 subs × $49 = **$49,000/mo**. AI cost = $4,090 + $2,150 = $6,240. **Margin: 87.3%.**

---

## 7. Recommended Model Strategy (Tiered, Not All-Opus)

Instead of using one model for everything, use the right model for each job:

| Task | Recommended Model | Why |
|------|------------------|-----|
| Intent classification | **Haiku 4.5** | Simple routing, doesn't need intelligence |
| Form enhancements | **Haiku 4.5** | Short, simple completions |
| Task generation (dashboard) | **Haiku 4.5** | Formulaic output |
| Tweet composition | **Sonnet 4.6** | Needs creativity but not deep reasoning |
| Email writing | **Sonnet 4.6** | Good balance of quality and cost |
| Name company | **Sonnet 4.6** | Creative but structured |
| Landing page content | **Sonnet 4.6** | Structured JSON generation |
| Mission document | **Opus 4.6** | High-stakes, user-facing, needs depth |
| Market research | **Opus 4.6** | Complex analysis, strategic thinking |
| User research | **Opus 4.6** | Nuanced analysis of person's background |
| Idea validation | **Opus 4.6** | Critical thinking needed |
| Onboarding pipeline | **Mixed** | Opus for research/mission, Sonnet for content |

### Cost with tiered approach (typical subscriber):

| Approach | Monthly Cost/User | vs All-Opus Savings |
|----------|------------------|---------------------|
| All Opus 4.6 | $4.09 | — |
| All Sonnet 4.6 | $2.38 | -42% |
| All GPT-4o | $1.72 | -58% |
| **Tiered (recommended)** | **~$1.80** | **-56%** |
| All Haiku 4.5 | $0.75 | -82% |

The tiered approach costs about the same as GPT-4o but gives **Opus-quality where it matters** (research, mission, validation) and saves on commodity tasks.

---

## 8. Alternative Pricing Models — How Others Do It

### 8a. Cursor's Model (Credit Pool)

- **How it works:** Monthly subscription ($20-$200) includes a dollar-equivalent credit pool. AI usage draws from pool based on model cost. "Auto mode" (cheapest model) is unlimited. Premium models consume from pool.
- **When pool runs out:** Extra usage billed at API rates or blocked.
- **Key insight:** Users feel in control. Unlimited access on cheap model reduces support burden. Premium = opt-in upgrade.

**Relevance to Artha:** Our tasks are more heterogeneous than Cursor's (code completion vs research vs email vs website). Credit pool per-dollar works if we can price each agent type at its actual cost.

### 8b. Claude's Model (Usage Capacity)

- **How it works:** Flat subscription ($20 Pro, $100-200 Max). No per-message credit. Instead, a "usage capacity" that resets every 5-8 hours (Pro) or weekly (Max). You get X messages per window, varying by model.
- **Key insight:** Simplest UX. No credit anxiety. Power users pay more for higher tier.
- **Downside:** Hard to apply to agentic tasks where cost per task varies 10x.

**Relevance to Artha:** Our agents have wildly different costs (tweet = $0.02, market research = $0.15). Flat capacity works poorly when task costs vary this much.

### 8c. Industry Consensus (Hybrid Model)

- **Dominant pattern in 2026:** Base subscription + included credits + overage billing
- ~31% of AI SaaS companies use hybrid models
- Credits abstract away token complexity — users don't care about tokens
- Prepaid credits reduce "bill shock" and improve predictability

### 8d. Outcome-Based Pricing

- Charge per **completed outcome** (e.g., "lead researched", "email sent", "website built")
- Different outcomes = different prices
- Most aligned with user value perception
- Examples: $2 per research report, $0.50 per email drafted, $5 per website revision

---

## 9. Pricing Model Comparison for Artha

| Model | Pros | Cons | Fit for Artha |
|-------|------|------|---------------|
| **Current (flat credits)** | Simple, predictable | All tasks cost same (unfair — tweet ≠ research) | OK but not ideal |
| **Weighted credits** | Fair pricing per task type | More complex UX, users must learn weights | Good |
| **Dollar pool (Cursor-style)** | Transparent, users see real cost | Exposes API cost, race-to-bottom pressure | Medium |
| **Tiered capacity (Claude-style)** | Simplest UX, no credit anxiety | Hard with variable task costs, risk of abuse | Poor fit |
| **Hybrid: base + weighted credits** | Fair, predictable, scales well | Slightly more complex than flat credits | **Best fit** |
| **Outcome-based** | Most value-aligned | Complex to implement, hard to price new tasks | Future option |

---

## 10. Recommended Approach

### Phase 1: Weighted Credits (Immediate)

Instead of 1 credit = 1 task (regardless of type), assign weights:

| Task Type | Credit Cost | Rationale |
|-----------|------------|-----------|
| Tweet / social post | 1 credit | Cheap, simple |
| Email draft | 1 credit | Standard |
| Task execution (simple) | 1 credit | Standard |
| Website revision | 2 credits | More complex, user-facing |
| Research report | 2 credits | Multi-call, expensive |
| Market research (deep) | 3 credits | 2+ API calls, web search, most expensive |
| Multi-agent (orchestrated) | 2-4 credits | Varies by subtask count |

This means 35 credits/month goes further for light users (lots of tweets/emails) and power users pay fairly for expensive ops.

### Phase 2: Included Usage + Overage (3-6 months)

Move to a Cursor-inspired model:

```
$49/month plan includes:
  - Unlimited simple tasks (tweets, emails, form enhancements)
  - 50 "premium actions" (research, website builds, multi-agent)
  - Nightly auto-task execution
  - Overage: $0.50 per premium action beyond 50
```

**Why this works:**
1. Removes credit anxiety for common actions (most users just draft emails/tweets)
2. Gates expensive operations fairly
3. Overage pricing still has 85%+ margin even on Opus 4.6
4. Easier to market ("unlimited emails, 50 research reports/month")

### Phase 3: Tiered Plans (6-12 months)

```
Starter ($29/mo):  Unlimited simple + 20 premium actions, no nightly auto
Pro ($49/mo):      Unlimited simple + 50 premium actions + nightly auto
Scale ($99/mo):    Unlimited simple + 150 premium actions + nightly auto + priority
```

---

## 11. Critical Safety Rails (Regardless of Model)

Protect against abuse and cost blowup:

1. **Rate limit chat messages**: Max 100/day per project (prevents 6,000/mo edge case)
2. **Rate limit intent classification**: Cache repeated intents (same user, similar message within 5min)
3. **Gate free tier**: Free users get onboarding + 5 credits. No more until subscribe or buy.
4. **Prompt caching**: Implement for all agent system prompts. Saves 90% on input tokens for repeated prompts. This alone could cut costs 30-40%.
5. **Batch API for async**: Nightly tasks, pipeline steps — use batch API for 50% off.

### Estimated savings from optimizations:

| Optimization | Savings | Effort |
|-------------|---------|--------|
| Prompt caching (system prompts) | 30-40% on input costs | Low (SDK feature) |
| Batch API for nightly tasks | 50% on nightly costs | Medium |
| Haiku for intent classification | 80% on classification costs | Low (config change) |
| Tiered models per agent | 40-55% overall | Low (config change) |
| **Combined** | **~60-70% total reduction** | **Low-Medium** |

With all optimizations on Opus 4.6 for premium tasks + Haiku for commodity:
- Typical subscriber cost: **~$1.20/month** (vs $4.09 unoptimized Opus)
- Heavy subscriber cost: **~$3.50/month** (vs $11.38 unoptimized Opus)

---

## 12. Final Verdict

| Question | Answer |
|----------|--------|
| Can we afford Opus 4.6 for everything? | **Yes**, margins stay 85%+ for typical users |
| Should we? | **No** — use tiered models. Opus where it matters, Haiku where it doesn't |
| Is our credit system good? | **OK but unfair** — all tasks cost 1 credit regardless of actual cost |
| Best alternative? | **Weighted credits now, then unlimited-simple + gated-premium later** |
| Biggest cost risk? | **Ungated free API calls** (intent classification, form enhancement) on free tier |
| Biggest quick win? | **Prompt caching + Haiku for routing** = 60%+ cost reduction |

---

## Sources

- [Anthropic API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [OpenAI API Pricing](https://openai.com/api/pricing/)
- [Cursor Pricing Model](https://cursor.com/pricing)
- [Claude Subscription Plans](https://claude.com/pricing)
- [6 Proven AI SaaS Pricing Models — Lago](https://getlago.com/blog/6-proven-pricing-models-for-ai-saas)
- [AI Pricing & Monetization Playbook — Bessemer](https://www.bvp.com/atlas/the-ai-pricing-and-monetization-playbook)
- [2026 Guide to AI Pricing Models — Monetizely](https://www.getmonetizely.com/blogs/the-2026-guide-to-saas-ai-and-agentic-pricing-models)
- [AI SaaS Moves to Consumption Pricing — PYMNTS](https://www.pymnts.com/news/artificial-intelligence/2026/ai-moves-saas-subscriptions-consumption)
