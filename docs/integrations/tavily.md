# Tavily Integration

Tavily provides live web search capabilities for Artha's research agents.

## What It Does

When AI agents need real-time information (competitors, market data, trends), they query the web via Tavily's search API. This powers:

- **User research** — Finding founder's public profile (LinkedIn, Twitter, etc.)
- **Idea research** — Competitor analysis, market sizing
- **Market research** — Deep competitive analysis with live data
- **Lead finding** — Discovering potential customers and contacts
- **Task execution** — Any research-type task that needs current information

## Flow

```
AI Agent needs web data
        │
        ▼
Tavily Search API
        │
        ├─ Query: "EdTech competitors pricing 2026"
        ├─ Returns: Ranked search results with content snippets
        │
        ▼
AI processes results
        │
        ├─ Analyzes and synthesizes findings
        ├─ Generates research document
        └─ Ingests key findings into Supermemory
```

## Configuration

| Variable | Description |
|----------|-------------|
| `TAVILY_API_KEY_DEV` | API key for development |
| `TAVILY_API_KEY_PROD` | API key for production |

The appropriate key is selected based on `NODE_ENV`.

## Usage Limits

Tavily free tier: 1,000 searches/month. The system optimizes usage by:
- Caching user research results (run once per user, not per project)
- Limiting search queries per pipeline step
- Using Supermemory to avoid redundant searches

## File Reference

- `src/lib/search.ts` — Tavily API wrapper with fallback handling
