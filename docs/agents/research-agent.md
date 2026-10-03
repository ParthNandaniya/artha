# Research Agent

Responsible for all research, analysis, and strategic thinking. This is the most versatile agent — it handles user research, idea validation, mission generation, market analysis, lead finding, customer research, and general on-demand research.

**Code:** `src/lib/agents/research.ts`

---

## When does it run?

```mermaid
flowchart TD
    subgraph Triggers
        T1[First prompt: user research]
        T2[First prompt: idea + mission + market]
        T3[Task with tag = research]
        T4[Task with tag = marketing]
        T5[Task with tag = content]
        T6[Chat: user asks research question]
        T7[Research panel: user clicks suggestion]
        T8[Research panel: user submits custom prompt]
    end

    T1 --> RA[Research Agent]
    T2 --> RA
    T3 --> RA
    T4 --> RA
    T5 --> RA
    T6 --> RA
    T7 --> RA
    T8 --> RA
```

| Trigger | Research type | When |
|---------|-------------|------|
| First prompt (onboarding) | User research | Always (one-time per user) |
| First prompt (onboarding) | Idea research + mission + market | Always (per company) |
| Research panel suggestion | Ads, leads, customer, target audience, etc. | On-demand (uses credits) |
| Research panel custom prompt | Any research with optional tag | On-demand (uses credits) |
| Chat message | Any research question | On-demand (uses credits) |
| Task execution | Lead research, customer research, content | On-demand (uses credits) |

### Credit gating (not subscription gating)

Research tasks are **credit-gated, not subscription-gated**. As long as the user has `task_credits > 0`, they can run research — regardless of whether they have an active subscription. This covers:

- Active subscriber with credits remaining
- Cancelled subscriber who still has unused credits from their last billing cycle
- User who purchased a one-time credit pack

If `task_credits = 0`, show a single modal with all available options based on the user's subscription state.

```mermaid
flowchart TD
    A[User triggers research] --> B{task_credits > 0?}
    B -->|Yes| C[Run research, decrement credit]
    B -->|No| D[Show credits modal]
    D --> E{subscription active?}
    E -->|Yes| F["Option: buy Credit Pack $25 for 15 credits"]
    E -->|No| G["Options: Subscribe $49/mo for 35 credits OR buy Credit Pack $25 for 15 credits"]
```

**Pricing options:**

| Option | Type | Price | Credits |
|--------|------|-------|---------|
| Pro Subscription | Recurring ($49/mo) | $49/month | 35 credits (40 first month) |
| Credit Pack | One-time purchase | $25 | 15 credits |

The modal adapts based on context — if the user has an active subscription, it only shows the credit pack (since they already subscribe). If no subscription, it shows both the subscription and the credit pack so the user can pick what works best. The $49/mo subscription is the only recurring plan. The $25 credit pack is a one-time purchase that adds credits to the same pool.

---

## Research panel (dashboard)

The Research panel is a dedicated tab in the project dashboard. It provides:

1. **Research suggestions** — pre-built research types based on the user's company
2. **Custom research modal** — user can write a prompt and optionally tag it
3. **Research history** — all past research documents with visual elements
4. **Quick access from chat** — user can also trigger research from the right chat sidebar

### Research suggestions

Based on the company the user created, we show contextual research suggestions. Clicking one triggers the research agent and produces a document on the dashboard.

| Suggestion | Tag | What it produces |
|-----------|-----|-----------------|
| Ads Research | `ads_research` | Ad platform analysis, budget recommendations, audience targeting, ROI projections with charts |
| Lead Finding | `lead_research` | Potential leads list saved to Leads table + research report |
| Customer Research | `customer_research` | ICP, pain points, buying triggers, customer journey map with visual flow |
| Target Audience Analysis | `target_audience` | Demographics, psychographics, behavior patterns with graphs |
| Competitor Analysis | `competitor_analysis` | Competitor breakdown, SWOT, market positioning chart |
| Market Trends | `market_trends` | Growing market indicators, trend graphs, opportunity sizing |
| Pricing Strategy | `pricing_research` | Competitor pricing, willingness-to-pay analysis, pricing model recommendations |
| Content Strategy | `content_research` | Content gaps, topic clusters, channel recommendations |

Each research document includes **visual elements where necessary**: graphs, analytics charts, market size visualizations, growth trend charts, user demographic breakdowns, and competitive positioning maps. These are rendered as embedded chart components in the document view.

### Custom research (modal + chat)

User can open a research modal from the Research panel or ask via chat sidebar:

```mermaid
flowchart TD
    A[User opens research modal] --> B[Enter research prompt]
    B --> C{Select tag?}
    C -->|Yes| D[Pick existing tag or create new]
    C -->|No tag| E[Auto-categorize or create new category]
    D --> F[Run research agent]
    E --> F
    F --> G[Save document with tag]
    G --> H[If lead_research: add to Leads table]
    G --> I[Show in Research panel history]
```

**From chat sidebar:** User can type research questions directly. The orchestrator detects research intent and routes to the Research Agent. Results appear in both chat and the Research panel.

### Custom research tags

Users can create custom research tags beyond the defaults. Custom tags are saved per project and appear in the tag picker for future research.

Default tags: `market_research`, `lead_research`, `customer_research`, `ads_research`, `target_audience`, `competitor_analysis`, `market_trends`, `pricing_research`, `content_research`

Custom tags: user-defined, stored in `research_tags` table.

---

## Research types

### 1. User research (one-time, first prompt)

Runs BEFORE naming the company. This is done once per user and reused across all their companies.

```mermaid
flowchart TD
    A[User signs up + submits idea] --> B{Already researched?}
    B -->|Yes| C[Skip — use existing profile]
    B -->|No| D[Research Agent: deep user research]
    D --> E[Search name + email across web]
    E --> F[Find LinkedIn, Twitter, GitHub, personal sites]
    F --> G[Analyze past projects, skills, experience]
    G --> H[Identify strengths and areas to focus on]
    H --> I[Suggest tasks to cover weak areas]
    I --> J[Save to users.google_data + Supermemory]
```

**What we search:**
- User's full name + email domain
- LinkedIn profile (title, experience, skills, connections)
- Twitter/X (bio, recent tweets, interests)
- GitHub (repos, languages, contributions)
- Personal website / blog
- Any public projects, companies, or products

**What we extract and save:**

```typescript
interface UserResearch {
  linkedinUrl?: string;
  twitterHandle?: string;
  githubUsername?: string;
  personalSite?: string;
  currentRole?: string;
  pastExperience: string[];       // "CTO at Acme Corp (2020-2023)"
  skills: string[];               // "React, Python, ML, Sales"
  strengths: string[];            // "Strong technical background", "Marketing experience"
  areasToFocusOn: string[];       // "Design skills", "Sales outreach", "Financial planning"
  suggestedTasks: string[];       // "Set up brand identity", "Create sales funnel", "Build financial model"
  interests: string[];            // "AI, SaaS, developer tools"
  relevanceToProject: string;     // "User has 5 years in fintech, project is a fintech tool — strong fit"
  socialProfiles: Record<string, string>;
}
```

**Key change:** Instead of "areas needing support", we identify **areas to focus on** — things the user may not have much experience with. Based on these, we generate suggested tasks so the user can cover gaps they might not think of on their own.

**Where it's saved:**

| Data | Where | Purpose |
|------|-------|---------|
| Full research JSON | `users.google_data.research` | Permanent user profile |
| Summary text | Supermemory (`userTag`) | Context for all future agent calls |
| Strengths + focus areas | `users.google_data.research.strengths` / `areasToFocusOn` | Task Generator uses this to suggest tasks for areas user should focus on |
| Suggested tasks | `users.google_data.research.suggestedTasks` | Pre-populate task queue with tasks covering user's blind spots |

**Multi-company linking:** User research is stored at the **user level** (`users.google_data.research`), not the company level. When a user has multiple companies:

- The same user research profile is shared across ALL their companies
- Each company's agents have access to the user's full background, skills, and strengths
- Each company has its own separate data (documents, tasks, leads, research history)
- The user profile is ingested into Supermemory with a `userTag` that all companies reference
- If the user's background is especially relevant to one company (e.g., fintech experience + fintech startup), the `relevanceToProject` field captures this per-company

```mermaid
flowchart TD
    U[User: John — CTO, 5yr fintech] --> C1[Company A: Fintech SaaS]
    U --> C2[Company B: AI Marketing Tool]
    U --> C3[Company C: Developer Platform]

    subgraph SharedUserProfile["Shared: users.google_data.research"]
        P1[Skills: React, Python, ML]
        P2[Strengths: Technical, Fintech]
        P3[Focus areas: Design, Marketing]
    end

    U --> SharedUserProfile

    subgraph PerCompany["Separate per company"]
        C1D[Company A: own docs, tasks, leads, research]
        C2D[Company B: own docs, tasks, leads, research]
        C3D[Company C: own docs, tasks, leads, research]
    end

    C1 --> C1D
    C2 --> C2D
    C3 --> C3D
```

**Skip logic:** If `users.google_data.research` already exists, skip the web research. This means creating a second company doesn't re-research the user — it reuses the existing profile. The `relevanceToProject` field is regenerated per company to capture how the user's background maps to each specific business.

### 2. Idea research + company naming (first prompt)

Quick validation of the business idea. Also generates the company name + tagline inline (no separate naming agent — it's one extra field in the JSON response).

```mermaid
flowchart TD
    A[Business idea + optional URL] --> B{URL provided?}
    B -->|Yes| C[Analyze existing company from URL]
    B -->|No| D[Analyze idea directly]
    C --> E[Extract brand, products, positioning from URL]
    E --> F[Analyze competitive landscape]
    D --> F
    F --> G[Estimate market size]
    G --> H[Assess timing — why now?]
    H --> I{Should user pivot or adjust direction?}
    I -->|Pivot suggested| J[Include pivot recommendation + reasoning]
    I -->|Direction is solid| K[Confirm direction with evidence]
    J --> L[Generate company name + tagline]
    K --> L
    L --> M[Generate summary]
    M --> N[Save to memory + Supermemory]
```

**If user provides a company URL:** We scrape/analyze the existing company website to understand their current brand, products, positioning, and market. This context is used throughout — including by the Website Builder agent to inform design decisions and maintain brand consistency.

**Pivot / direction suggestions:** The research agent does NOT blindly validate whatever the user asks for. If the data suggests the user should pivot, take a different route, or adjust their approach for better chances of success, the agent will say so with evidence and reasoning. This includes:
- Market too saturated → suggest a niche or adjacent market
- Timing is wrong → suggest waiting or a different entry strategy
- Better opportunity nearby → suggest pivoting to capture it
- Business model issues → suggest alternative monetization

**Output:** JSON with `companyName`, `tagline`, `competitors[]`, `marketSize`, `timing`, `summary`, `pivotSuggestion?`, `existingCompanyAnalysis?`

**AI calls:** 1 call (name + research bundled — no extra cost for naming)

### 3. Mission & strategy (first prompt)

Comprehensive mission document.

```mermaid
flowchart TD
    A[Idea + user background + idea research] --> B[Generate mission document]
    B --> C[Company name & tagline]
    C --> D[Mission statement + vision]
    D --> E[Problem → solution → audience]
    E --> F[Value proposition + initial strategy]
    F --> G[Save as document + memory + Supermemory]
```

**Output:** Full Markdown document saved to `documents` table with `type = 'mission'`

**AI calls:** 1 `generateCompletion` call (max 3000 tokens)

### 4. Market research (first prompt)

Deeper competitive analysis with visual elements.

```mermaid
flowchart TD
    A[Idea + mission context] --> B[Structured competitor analysis]
    B --> C[Each competitor: name, description, strengths, weaknesses]
    C --> D[Market gaps and opportunities]
    D --> E[Target market size + key trends]
    E --> F[Growth projections + trend data]
    F --> G[Full Markdown report with chart data]
    G --> H[Save as document + memory + Supermemory]
```

**Output:**
- JSON metadata: `competitors[]`, `gaps[]`, `targetMarketSize`, `keyTrends[]`, `growthData[]`, `chartData{}`
- Markdown report with embedded chart data: Executive Summary, Market Overview (with market size chart), Competitive Analysis (with positioning map), Gaps, Target Customer (with demographic breakdown), Growth Trends (with trend graph), Risks, Recommendations

**AI calls:** 2 calls (1 `generateJSON` for structured data, 1 `generateCompletion` for report)

### 5. Lead research (on-demand task)

Runs when user triggers it from the Research panel, chat, or task queue. NOT automatic.

```mermaid
flowchart TD
    A[User triggers lead research] --> B[Analyze target audience from mission]
    B --> C[Identify lead channels]
    C --> D[Find specific people/companies to reach]
    D --> E[Extract contact details: email, LinkedIn, company, role]
    E --> F[Score and prioritize leads]
    F --> G[Save leads to leads table with full details]
    G --> H[Save research doc + Supermemory]
```

**Output:**
- `documents.type = 'lead_research'` — full report with analytics
- `leads` table — individual leads with name, email, linkedin_url, company, role, phone, source, score, notes, metadata
- Memory: `leadChannels`, `leadSources`, `outreachStrategy`

**Leads table integration:** When lead research finds new people, they are added to the existing leads list (not replaced). If a subsequent research finds the same person, their record is updated/merged rather than duplicated.

### 6. Customer research (on-demand task)

```mermaid
flowchart TD
    A[User triggers customer research] --> B[Define ICP from mission + market]
    B --> C[Identify pain points]
    C --> D[Map buying triggers]
    D --> E[Analyze customer journey with visual flow]
    E --> F[Demographics + psychographics with charts]
    F --> G[Save as document + memory]
```

**Output:**
- `documents.type = 'customer_research'` with embedded chart data for demographics, journey map
- Memory: `icp`, `painPoints`, `buyingTriggers`

### 7. General research (any time)

Open-ended research triggered by chat, Research panel modal, or task.

```mermaid
flowchart TD
    A[User submits research prompt] --> B{Tag provided?}
    B -->|Yes| C[Use provided tag]
    B -->|No| D[Auto-categorize or create new category]
    C --> E[Run research agent with context]
    D --> E
    E --> F[Generate research document with visuals]
    F --> G{Contains leads/contacts?}
    G -->|Yes| H[Add to leads table]
    G -->|No| I[Save document only]
    H --> I
    I --> J[Show in Research panel + Documents panel]
```

Examples: "Research competitor pricing models", "What's the best tech stack for our product?", "Find potential investors in our space", "Analyze social media trends in our niche"

**From chat sidebar:** User can ask research questions directly in chat. The orchestrator detects research intent and routes to the Research Agent. The result appears in chat AND is saved as a document in the Research panel.

### 8. Custom research tags and agents

Users can create custom research tags that persist per project. When a user creates a custom tag:

1. Tag is saved to `research_tags` table
2. Future research can use this tag
3. Research panel shows documents grouped by tag
4. The Research Agent adapts its behavior based on the tag context

```mermaid
flowchart TD
    A[User creates custom tag] --> B[Save to research_tags table]
    B --> C[Tag appears in tag picker]
    C --> D[User runs research with custom tag]
    D --> E[Agent uses tag context for focused research]
    E --> F[Document saved with custom tag]
    F --> G[Grouped in Research panel under custom category]
```

---

## Execution flow

```mermaid
flowchart TD
    Orch[Orchestrator] --> Input[AgentInput: prompt + context]
    Input --> Classify{Classify research type}
    Classify -->|user| UserResearch[User research flow]
    Classify -->|idea| IdeaResearch[Idea research flow]
    Classify -->|mission| MissionGen[Mission generation flow]
    Classify -->|market| MarketResearch[Market research flow]
    Classify -->|leads| LeadResearch[Lead research flow]
    Classify -->|customer| CustomerResearch[Customer research flow]
    Classify -->|general| GeneralResearch[General research flow]
    Classify -->|custom_tag| CustomResearch[Custom tag research flow]

    UserResearch --> Output[AgentOutput]
    IdeaResearch --> Output
    MissionGen --> Output
    MarketResearch --> Output
    LeadResearch --> Output
    CustomerResearch --> Output
    GeneralResearch --> Output
    CustomResearch --> Output

    Output --> Orch2[Orchestrator persists everything]
```

The agent receives a prompt and context. It classifies what kind of research is needed (or the orchestrator tells it via `metadata.researchType`), runs the appropriate flow, and returns an `AgentOutput`.

---

## Combined first-prompt research

During onboarding, the Research Agent is called with `metadata.researchType = 'onboarding'` and runs idea research + mission + market in a single agent invocation (3-4 AI calls total, not 3 separate agent calls).

```mermaid
flowchart TD
    A[Orchestrator calls Research Agent with onboarding type] --> B[Idea research — 1 call]
    B --> C[Mission generation — 1 call]
    C --> D[Market research — 2 calls]
    D --> E[Return combined AgentOutput]
    E --> F[3 documents + multiple memory keys + Supermemory ingestions]
```

This batching reduces overhead — one agent invocation, one context build, multiple outputs.

---

## Leads management

The Leads panel provides a full CRM-like table for managing contacts discovered through research.

### Leads table schema

```sql
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT,
    email TEXT,
    linkedin_url TEXT,
    company TEXT,
    role TEXT,
    phone TEXT,
    website TEXT,
    source TEXT,                    -- 'lead_research', 'manual', 'chat', etc.
    source_research_id UUID,       -- links to the research document that found this lead
    score INTEGER DEFAULT 0,       -- 0-100 priority score
    status TEXT DEFAULT 'new',     -- 'new', 'contacted', 'replied', 'qualified', 'converted', 'lost'
    contacted BOOLEAN DEFAULT FALSE,
    contacted_at TIMESTAMPTZ,
    notes TEXT,                    -- user can leave notes
    tags TEXT[] DEFAULT '{}',      -- custom tags for filtering
    metadata JSONB DEFAULT '{}',   -- any extra data: social profiles, company size, etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Leads panel features

- **Table view** with sortable columns: name, company, role, email, LinkedIn, score, status, contacted, last note
- **Inline editing**: user can tick "contacted", change status, leave notes directly in the table
- **Filters**: by status, score range, source, tags
- **Search**: full-text search across name, company, email
- **Bulk actions**: mark multiple as contacted, change status
- **Detail modal**: click a lead to see full details, all notes, research source
- **Auto-merge**: when research finds someone already in the table, update their record instead of creating a duplicate
- **Save to DB**: all changes persist immediately

### How leads are populated

```mermaid
flowchart TD
    A[Lead research runs] --> B[Agent finds contacts]
    B --> C{Contact already in leads table?}
    C -->|Yes| D[Update existing record with new data]
    C -->|No| E[Insert new lead]
    D --> F[Leads table updated]
    E --> F
    F --> G[User sees updated leads in Leads panel]
```

---

## Nightly execution

The nightly cron runs **once per night** and executes **one task per project**. It checks credits only (not subscription status). If the queue is empty, it generates 5 new tasks first, then picks the top one to execute.

```mermaid
flowchart TD
    Cron[Nightly cron fires — once per night] --> ForEach[For each project]
    ForEach --> Credits{task_credits > 0?}
    Credits -->|No| Skip[Skip project]
    Credits -->|Yes| Queue{Queued tasks exist?}
    Queue -->|No| Generate[Task Generator: create 5 tasks]
    Queue -->|Yes| Pick[Pick top task — ORDER BY priority ASC LIMIT 1]
    Generate --> Pick
    Pick --> Execute[Execute top task via orchestrator]
    Execute --> MarkDone[Mark task as completed]
    MarkDone --> Decrement[Decrement task_credits]
    Decrement --> Remaining["Remaining queued tasks = 4 (if generated) or N-1 (if existing)"]
    Remaining --> Done[Done for this project]
```

**How it works step by step:**
1. Cron fires once per night
2. For each project with `task_credits > 0`:
   - Check if queued tasks exist
   - If NO queued tasks → Task Generator creates 5 new tasks (research, marketing, content, etc. based on company context)
   - Pick the top task (lowest priority number = highest priority)
   - Execute it via the orchestrator
   - Mark the task as completed
   - Decrement `task_credits` by 1
   - After execution: if 5 were generated, 4 remain queued for future nights

**Key rules:**
- **No subscription check** — only `task_credits > 0` matters. Cancelled subscribers with remaining credits still get nightly execution.
- **Auto-generate when empty** — if the queue has no tasks, we generate 5 new ones so there's always work to do.
- **One task per night** — exactly one queued task is executed per project per night.
- **No automatic post-subscription tasks** — nothing runs automatically the moment a user subscribes. The nightly cron handles it on schedule.

---

## Data persistence

```mermaid
flowchart LR
    RA[Research Agent output] --> D1[documents — full Markdown reports with chart data]
    RA --> D2[leads — contacts found via research]
    RA --> D3[memory — structured key-value]
    RA --> D4[Supermemory — semantic memory]
    RA --> D5[users.google_data — user research]
    RA --> D6[tasks — update if task-driven]
    RA --> D7[research_tags — custom tags]
```

| Research type | documents | leads | memory keys | Supermemory | User sees? |
|--------------|-----------|-------|-------------|-------------|-----------|
| User research | — | — | — | Yes (user tag) | No |
| Idea research | — | — | `ideaResearch`, `competitors` | Yes | No (used by other agents) |
| Mission | `type='mission'` | — | `mission`, `vision`, `targetAudience` | Yes | Yes — Documents panel |
| Market research | `type='market_research'` | — | `competitors`, `marketSize`, `keyInsights`, `chartData` | Yes | Yes — Research + Documents panel |
| Lead research | `type='lead_research'` | Yes — new/updated leads | `leadChannels`, `leadSources` | Yes | Yes — Research + Leads panel |
| Customer research | `type='customer_research'` | — | `icp`, `painPoints`, `buyingTriggers` | Yes | Yes — Research + Documents panel |
| Ads research | `type='ads_research'` | — | `adStrategy`, `adBudget`, `targetPlatforms` | Yes | Yes — Research panel |
| Target audience | `type='target_audience'` | — | `demographics`, `psychographics` | Yes | Yes — Research panel |
| General | `type='research'` | Maybe | Varies | Yes | Yes — Research + Documents panel |
| Custom tag | `type=custom_tag` | Maybe | Varies | Yes | Yes — Research panel |

---

## Visual elements in research documents

Every research document MUST include visual elements — graphs, charts, analytics summaries — to make the research interactive and easy to digest. Raw text walls are not acceptable. The AI prompt for each research type explicitly requests structured chart data alongside the narrative.

### Required visuals per research type

| Research type | Required visuals |
|--------------|-----------------|
| Market research | Market size bar chart, growth trend line chart, competitor positioning map |
| Lead research | Lead score distribution bar chart, leads-by-source pie chart, leads summary table |
| Customer research | Customer journey funnel, demographic pie charts, pain point severity radar |
| Ads research | Platform comparison bar chart, budget allocation pie chart, projected ROI line chart |
| Target audience | Age/gender demographic charts, behavior pattern radar, geographic distribution |
| Competitor analysis | Feature comparison radar, pricing comparison bar chart, market share pie chart |
| Market trends | Trend line charts (multi-year), opportunity sizing bar chart, adoption curve |
| Pricing research | Competitor pricing comparison table + bar chart, willingness-to-pay distribution |
| Content research | Topic cluster map, channel effectiveness bar chart, content gap analysis table |

### Chart types supported

| Chart type | Used in | Example |
|-----------|---------|---------|
| Bar chart | Market size, competitor comparison, budget allocation | Market size by segment |
| Line chart | Growth trends, revenue projections, market trends | TAM growth over 5 years |
| Pie chart | Market share, audience demographics, channel distribution | Competitor market share |
| Funnel chart | Customer journey, conversion rates | Awareness → Interest → Decision → Action |
| Radar chart | Competitor SWOT, skill assessment | Competitor feature comparison |
| Table | Competitor details, lead lists, pricing comparison | Competitor pricing table |
| Metric card | Key stats (market size, growth rate, lead count) | "$2.4B TAM", "23% CAGR" |

### Analytics summary block

Every research document includes a top-level analytics summary rendered as metric cards at the top of the document view:

```typescript
interface AnalyticsSummary {
  metrics: {
    label: string;      // "Total Addressable Market"
    value: string;      // "$2.4B"
    trend?: string;     // "+12% YoY"
    trendDirection?: 'up' | 'down' | 'flat';
  }[];
}
```

### Chart data format in documents

```typescript
interface ResearchDocument {
  type: string;
  title: string;
  content: string;  // Markdown with <!-- chart:chartId --> placeholders
  metadata: {
    tag: string;
    charts: {
      [chartId: string]: {
        type: 'bar' | 'line' | 'pie' | 'funnel' | 'radar' | 'table' | 'metric';
        title: string;
        data: Record<string, unknown>;
        description?: string;
      };
    };
    analytics: {
      metrics: { label: string; value: string; trend?: string; trendDirection?: 'up' | 'down' | 'flat' }[];
      marketSize?: string;
      growthRate?: string;
      competitorCount?: number;
      leadCount?: number;
    };
  };
}
```

### How charts are rendered

The Markdown content uses `<!-- chart:chartId -->` placeholders. The frontend document viewer:
1. Parses the Markdown content
2. When it encounters a chart placeholder, looks up the chart data in `metadata.charts`
3. Renders the appropriate chart component (using recharts or similar)
4. Renders the analytics summary as metric cards at the top of the document

---

## URL analysis for existing companies

When a user provides a URL during onboarding (their existing company website), the Research Agent:

1. Scrapes/analyzes the website content, branding, products, pricing
2. Extracts brand identity (colors, tone, positioning)
3. Identifies current market positioning
4. Saves this as `existingCompanyAnalysis` in memory

This data is then used by:
- **Website Builder Agent** — to maintain brand consistency, use similar design language
- **Research Agent** — to provide more accurate competitive analysis
- **Email Writer Agent** — to match brand voice in communications
- **Task Generator** — to suggest tasks relevant to the existing business

---

## Cost optimization

| Research type | AI calls | Model | When |
|--------------|----------|-------|------|
| User research | 1 | gpt-4o-mini | First prompt (one-time) |
| Idea research | 1 | gpt-4o-mini | First prompt |
| Mission | 1 | gpt-4o-mini | First prompt |
| Market research | 2 | gpt-4o-mini | First prompt |
| Lead research | 2-3 | gpt-4o-mini | On-demand (uses credits) |
| Customer research | 1-2 | gpt-4o-mini | On-demand (uses credits) |
| Ads research | 1-2 | gpt-4o-mini | On-demand (uses credits) |
| Target audience | 1-2 | gpt-4o-mini | On-demand (uses credits) |
| General / custom | 1-2 | gpt-4o-mini | On-demand (uses credits) |

**First prompt total: 5 AI calls** (user research + idea + mission + market)
