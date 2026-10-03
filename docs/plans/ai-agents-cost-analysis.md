# AI Ops Agents — Cost Analysis & ROI

> Can we run 7 autonomous agents profitably with 50-60%+ margins?
> **Yes — if we run Sonnet-only with caching. Here's the math.**

---

## Pricing Reference (Sonnet 4.6)

| | Per 1M Tokens | With Prompt Cache (90% input savings) | With Batch API (50% off) |
|---|---|---|---|
| **Input** | $3.00 | $0.30 | $1.50 |
| **Output** | $15.00 | $15.00 | $7.50 |
| **Cached + Batch** | — | $0.15 input / $7.50 output | — |

We should use **prompt caching + batch API** for all ops agents since they're async (not user-facing).

---

## Per-Agent Cost Breakdown (Sonnet 4.6 Only)

### Agent 1: Growth Agent (Marketing & Content)

| | Tokens | Count |
|---|---|---|
| Runs/day | — | 6 (every 4h) |
| Input tokens/run | ~3,000 (system prompt ~2,000 + context ~1,000) | |
| Output tokens/run | ~1,500 (tweet + analysis) | |

**Per run (no optimization):**
- Input: 3,000 × $3.00/1M = $0.009
- Output: 1,500 × $15.00/1M = $0.0225
- **Total: $0.032/run**

**Per run (cached + batch):**
- Input: 2,000 cached × $0.15/1M + 1,000 fresh × $1.50/1M = $0.0003 + $0.0015 = $0.0018
- Output: 1,500 × $7.50/1M = $0.011
- **Total: $0.013/run**

| Period | No Optimization | Cached + Batch |
|---|---|---|
| Daily (6 runs) | $0.19 | $0.08 |
| **Monthly** | **$5.76** | **$2.34** |

---

### Agent 2: Support Agent

| | Tokens | Count |
|---|---|---|
| Runs/day | — | 48 (every 30 min) + ~5 webhook triggers |
| Input tokens/run | ~2,500 (system prompt ~1,800 + ticket context ~700) | |
| Output tokens/run | ~800 (response + classification) | |

Most runs will be "no new tickets" — early exit with minimal tokens (~200 total). Assume 40 idle + 13 active.

**Active run (cached + batch):**
- Input: 1,800 cached × $0.15/1M + 700 fresh × $1.50/1M = $0.00027 + $0.00105 = $0.0013
- Output: 800 × $7.50/1M = $0.006
- **Total: $0.007/active run**

**Idle run:** ~$0.0003 (just a DB check, minimal AI)

| Period | No Optimization | Cached + Batch |
|---|---|---|
| Daily (13 active + 40 idle) | $1.04 | $0.10 |
| **Monthly** | **$31.20** | **$3.10** |

---

### Agent 3: Sales Agent

| | Tokens | Count |
|---|---|---|
| Runs/day | — | 12 (every 2h) |
| Input tokens/run | ~3,500 (system prompt ~2,000 + user segments ~1,500) | |
| Output tokens/run | ~1,200 (email drafts + targeting decisions) | |

Most runs will segment users and only act on a few. Assume 8 idle + 4 active.

**Active run (cached + batch):**
- Input: 2,000 cached × $0.15/1M + 1,500 fresh × $1.50/1M = $0.0003 + $0.00225 = $0.0026
- Output: 1,200 × $7.50/1M = $0.009
- **Total: $0.012/active run**

| Period | No Optimization | Cached + Batch |
|---|---|---|
| Daily (4 active + 8 idle) | $0.31 | $0.05 |
| **Monthly** | **$9.41** | **$1.58** |

---

### Agent 4: Analytics Agent (BI)

| | Tokens | Count |
|---|---|---|
| Daily runs | — | 1 |
| Weekly deep dive | — | 1 (Sundays) |
| Input tokens (daily) | ~5,000 (system prompt ~2,000 + metrics data ~3,000) | |
| Output tokens (daily) | ~3,000 (report) | |
| Input tokens (weekly) | ~10,000 (more data, cohorts, comparisons) | |
| Output tokens (weekly) | ~6,000 (deep report) | |

**Daily run (cached + batch):**
- Input: 2,000 cached × $0.15/1M + 3,000 fresh × $1.50/1M = $0.0003 + $0.0045 = $0.005
- Output: 3,000 × $7.50/1M = $0.023
- **Total: $0.028/daily run**

**Weekly run (cached + batch):**
- Input: 2,000 cached × $0.15/1M + 8,000 fresh × $1.50/1M = $0.0003 + $0.012 = $0.012
- Output: 6,000 × $7.50/1M = $0.045
- **Total: $0.057/weekly run**

| Period | No Optimization | Cached + Batch |
|---|---|---|
| **Monthly** (30 daily + 4 weekly) | **$7.92** | **$1.07** |

---

### Agent 5: Ops Agent (Health Monitoring)

| | Tokens | Count |
|---|---|---|
| Runs/day | — | 96 (every 15 min) |
| Input tokens/run | ~500 (system prompt ~300 + health data ~200) | |
| Output tokens/run | ~200 (status + any alerts) | |

This agent should be **mostly code, not AI.** Health checks are SQL queries and HTTP pings. AI only involved when anomaly detected (~5% of runs).

**AI run (cached + batch) — anomaly only:**
- Input: 300 cached × $0.15/1M + 200 fresh × $1.50/1M = $0.000045 + $0.0003 = $0.0003
- Output: 200 × $7.50/1M = $0.0015
- **Total: $0.002/AI run**

**Non-AI run:** $0 (just SQL + HTTP, no LLM call)

| Period | No Optimization | Cached + Batch |
|---|---|---|
| Daily (~5 AI runs + 91 code-only) | $0.05 | $0.01 |
| **Monthly** | **$1.44** | **$0.29** |

---

### Agent 6: Product Agent

| | Tokens | Count |
|---|---|---|
| Runs/week | — | 1 (Monday) |
| Input tokens/run | ~12,000 (system prompt ~2,000 + usage data ~5,000 + feedback ~5,000) | |
| Output tokens/run | ~8,000 (detailed product weekly report) | |

**Weekly run (cached + batch):**
- Input: 2,000 cached × $0.15/1M + 10,000 fresh × $1.50/1M = $0.0003 + $0.015 = $0.015
- Output: 8,000 × $7.50/1M = $0.06
- **Total: $0.075/run**

| Period | No Optimization | Cached + Batch |
|---|---|---|
| **Monthly** (4 runs) | **$1.92** | **$0.30** |

---

### Agent 7: Community Agent

| | Tokens | Count |
|---|---|---|
| Runs/day | — | 24 (every 1h) |
| Input tokens/run | ~2,000 (system prompt ~1,500 + mentions/milestones ~500) | |
| Output tokens/run | ~600 (responses, tweets) | |

Most runs will be "nothing new" — idle. Assume 18 idle + 6 active.

**Active run (cached + batch):**
- Input: 1,500 cached × $0.15/1M + 500 fresh × $1.50/1M = $0.000225 + $0.00075 = $0.001
- Output: 600 × $7.50/1M = $0.0045
- **Total: $0.006/active run**

| Period | No Optimization | Cached + Batch |
|---|---|---|
| Daily (6 active + 18 idle) | $0.58 | $0.04 |
| **Monthly** | **$17.28** | **$1.08** |

---

## Total Monthly Cost Summary

| Agent | No Optimization | Cached + Batch | % of Total |
|-------|-----------------|----------------|------------|
| Growth | $5.76 | **$2.34** | 24% |
| Support | $31.20 | **$3.10** | 32% |
| Sales | $9.41 | **$1.58** | 16% |
| Analytics | $7.92 | **$1.07** | 11% |
| Ops | $1.44 | **$0.29** | 3% |
| Product | $1.92 | **$0.30** | 3% |
| Community | $17.28 | **$1.08** | 11% |
| **TOTAL** | **$74.93/mo** | **$9.76/mo** | 100% |

### Compare with original plan estimate:

| | Original Plan (mixed Opus/Sonnet) | Sonnet Only (no opt) | Sonnet Only (cached + batch) |
|---|---|---|---|
| Monthly cost | ~$330 | ~$75 | **~$10** |

The original plan was way overestimated because it assumed Opus for Growth/Product and didn't account for idle runs or optimizations.

---

## ROI Analysis

### What do these agents produce?

| Agent | Monthly Output | Estimated Revenue Impact |
|-------|---------------|-------------------------|
| **Growth** | ~180 tweets, 4 blog posts | +10-30 signups/mo (organic) |
| **Support** | ~400 auto-responses | Saves 20+ hours of founder time |
| **Sales** | ~120 targeted emails | +2-5% conversion rate lift |
| **Analytics** | 30 daily + 4 weekly reports | Better decisions (hard to quantify) |
| **Ops** | 24/7 monitoring | Prevents downtime = prevents churn |
| **Product** | 4 product reports | Better roadmap prioritization |
| **Community** | ~180 interactions | Brand awareness, user retention |

### Revenue math — what does it take to cover $10/mo?

**Literally nothing.** $10/mo is noise. One user on the $49/mo plan covers 5 months of ops agents.

But let's be rigorous about ROI:

### Scenario: Current state (small scale, 50 users)

| | Without Ops Agents | With Ops Agents | Delta |
|---|---|---|---|
| Founder hours on support/week | 10h | 3h | -7h saved |
| Founder hours on content/week | 5h | 1h | -4h saved |
| Founder hours on analytics/week | 3h | 0.5h | -2.5h saved |
| **Total hours saved/week** | | | **13.5h** |
| Value of founder time (@ $100/h) | | | **$5,400/mo** |
| Ops agent cost | | | **$10/mo** |
| **ROI** | | | **540x** |

### Scenario: Revenue impact (100 subscribers)

| Metric | Without Agents | With Agents | Delta |
|---|---|---|---|
| Monthly signups (organic) | 50 | 65 (+30% from content) | +15 |
| Free-to-paid conversion | 8% | 10% (+25% from sales agent) | +2% |
| New subscribers/mo | 4 | 6.5 | +2.5 |
| Monthly churn | 5% | 4% (faster support) | -1% |
| Revenue/mo | $4,900 | $4,900 + ($122/mo new) | +$122/mo compounding |
| Ops agent cost | $0 | $10 | $10 |

At 100 subs, even converting **1 extra user per month** ($49) covers the ops agents **5x over**.

---

## Profit Margin Analysis

You need 50-60%+ margins. Here's where it stands:

### Ops agents as a line item

| Revenue Base | Ops Agent Cost | Ops as % of Revenue | Margin Impact |
|---|---|---|---|
| 10 subs ($490/mo) | $10 | 2.0% | Negligible |
| 50 subs ($2,450/mo) | $10 | 0.4% | Negligible |
| 100 subs ($4,900/mo) | $10 | 0.2% | Negligible |
| 500 subs ($24,500/mo) | $10 | 0.04% | Invisible |

### Full cost picture (Artha total)

| Cost Item | Monthly Cost | Notes |
|---|---|---|
| **AI for user operations** | ~$2.38/user × users | Sonnet, typical user (from existing cost analysis) |
| **AI for ops agents** | **$10** | Fixed cost, doesn't scale with users |
| Render hosting | ~$25-50 | Web + Worker services |
| Neon DB | ~$19 | Pro plan |
| Cloudflare | ~$5 | Pages + R2 |
| Postmark | ~$10-50 | Depends on volume |
| Domains | ~$2 | Amortized |
| **Total fixed costs** | **~$71-137/mo** | |

### Margin at different scales

| Users (subscribers) | Revenue | AI Cost (users) | AI Cost (ops) | Other Fixed | **Total Cost** | **Margin** |
|---|---|---|---|---|---|---|
| 10 | $490 | $24 | $10 | $71 | $105 | **78.6%** |
| 25 | $1,225 | $60 | $10 | $71 | $141 | **88.5%** |
| 50 | $2,450 | $119 | $10 | $85 | $214 | **91.3%** |
| 100 | $4,900 | $238 | $10 | $100 | $348 | **92.9%** |
| 300 | $14,700 | $714 | $10 | $137 | $861 | **94.1%** |

**At every scale, margins are well above 60%.** The ops agents at $10/mo are essentially free.

---

## Can We Run Even Cheaper?

Yes. If $10/mo feels like too much (it shouldn't), here are levers:

### Option A: Reduce frequency

| Change | Monthly Savings |
|---|---|
| Growth: 4h → 8h (3 runs/day) | -$1.17 |
| Community: 1h → 3h (8 runs/day) | -$0.72 |
| Support: 30min → 1h (24 runs/day) | -$1.55 |
| Sales: 2h → 6h (4 runs/day) | -$1.05 |
| **Reduced total** | **$5.27/mo** |

### Option B: Use Haiku 4.5 for simple agents

Haiku is 3x cheaper than Sonnet. Use it for Ops, Community, and Growth (simple tasks):

| Agent | Sonnet Cost | Haiku Cost |
|---|---|---|
| Growth | $2.34 | $0.78 |
| Community | $1.08 | $0.36 |
| Ops | $0.29 | $0.10 |
| Others (stay Sonnet) | $6.05 | $6.05 |
| **Total** | **$9.76** | **$7.29** |

### Option C: Nuclear — Haiku for everything + reduced frequency

**$2.43/mo total.** Basically free. Quality will be noticeably worse for Sales and Support agents though.

---

## Recommendation

| Decision | Answer |
|---|---|
| Run on Sonnet only? | **Yes.** Opus not needed for ops tasks. |
| Use prompt caching? | **Absolutely.** 90% input savings on repeated system prompts. |
| Use batch API? | **Yes.** All ops agents are async, perfect for batch. |
| Expected monthly cost? | **~$10/mo** (Sonnet + caching + batch) |
| Margin impact? | **< 0.5% at any scale above 20 users** |
| Meets 50-60% profit margin? | **Yes — margins are 78%+ even at just 10 subscribers** |
| Break-even point? | **< 1 subscriber** (one $49/mo user covers 5 months of ops agents) |
| Should we do this? | **Yes. The cost is negligible. The ROI is in founder time saved and growth compounding.** |

---

## Implementation Cost (One-Time Engineering)

The real cost isn't AI — it's engineering time to build the agents:

| Phase | Effort | Engineering Cost (@ $100/h) |
|---|---|---|
| Foundation (DB, worker, tools) | ~20h | $2,000 |
| Core agents (Ops, Analytics, Support) | ~30h | $3,000 |
| Growth agents (Growth, Community, Sales) | ~25h | $2,500 |
| Product agent + coordination | ~15h | $1,500 |
| Public showcase | ~10h | $1,000 |
| **Total** | **~100h** | **$10,000** |

At $10/mo ongoing cost, the payback period on engineering investment is essentially **"whenever the agents save more founder time than they took to build"** — which is month 1 given 13.5h/week of time savings.
