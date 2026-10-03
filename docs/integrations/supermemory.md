# Supermemory Integration

Supermemory provides persistent semantic memory for Artha's AI agents. It uses hybrid search (BM25 + embeddings) to retrieve relevant context.

## Why Supermemory

Artha needs AI agents to "remember" past work, company context, and user interactions. Supermemory provides:
- **Semantic search** — Find relevant memories by meaning, not just keywords
- **Persistence** — Context survives across sessions and tasks
- **Scoped isolation** — Each user and company has its own memory container

## Two-Tier Memory Model

```
┌─────────────────────────────────────────────┐
│           STRUCTURED MEMORY                  │
│           (Neon DB - memory table)           │
│                                              │
│  Key-value pairs for fast, deterministic     │
│  lookups. Company facts, settings, flags.    │
│                                              │
│  Examples:                                   │
│  ├─ companyName = "TutorAI"                 │
│  ├─ tagline = "AI tutoring for students"    │
│  ├─ mission = "Democratize education..."    │
│  ├─ competitors = "Khan, Chegg, Duolingo"   │
│  ├─ emailConfigured = "true"                │
│  └─ landingPageUrl = "tutorai.tryartha.com" │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│           SEMANTIC MEMORY                    │
│           (Supermemory API)                  │
│                                              │
│  Vector-based search for AI context.         │
│  Research, conversations, task results.      │
│                                              │
│  Containers:                                 │
│  ├─ artha_user_{userId}                     │
│  │   └─ Founder background, preferences     │
│  └─ artha_company_{projectId}               │
│      └─ Research, tasks, conversations       │
└─────────────────────────────────────────────┘
```

## Key Functions

### `ingestMemory(opts)`

Add content to semantic memory.

```typescript
await ingestMemory({
  content: "Market research shows EdTech growing at 16% CAGR...",
  containerTag: `artha_company_${projectId}`,
  customId: `research_${researchId}`,
  syncMapKey: `research_${researchId}`,
  // sync state stored in memory table or users.google_data
});
```

**Behavior:**
1. Normalizes content (max 2200 chars, whitespace cleanup)
2. Hashes content for deduplication
3. Checks sync map — skips if content hash matches existing entry
4. Calls Supermemory API to ingest
5. Updates sync map with new hash and memory ID

### `getRelevantContext(opts)`

Retrieve relevant memories for AI context.

```typescript
const context = await getRelevantContext({
  query: "competitor pricing strategy",
  containerTag: `artha_company_${projectId}`,
  threshold: 0.5, // relevance score threshold
});
// Returns formatted string ≤1800 chars
```

**Behavior:**
1. Validates query is substantive (≥16 chars, not low-signal)
2. Performs hybrid search (BM25 + embedding similarity)
3. Filters results by threshold (default 0.5)
4. Formats top results as context string

### `buildTaskContext(projectId, userId, taskDescription)`

Build complete context for AI task execution.

```
Returns: {
  companyProfile: "...",    // From memory table
  founderProfile: "...",    // From users.google_data
  relevantContext: "..."    // From Supermemory search
}
```

### `buildChatContext(projectId, userId, userMessage)`

Same as `buildTaskContext` but optimized for chat:
- Higher relevance threshold (0.55 vs 0.45)
- Query based on user message rather than task description

### `ingestTaskResult(taskId, projectId, result)`

Persist completed task outcomes for future reference.

### `ingestConversation(projectId, userId, messages)`

Persist substantive chat conversations (≥220 chars). Filters out error messages.

### `ingestInboundEmail(emailId, projectId, email)`

Persist inbound customer emails for AI context.

## Sync State

Deduplication is managed via sync maps:

| Scope | Storage Location |
|-------|-----------------|
| User memories | `users.google_data.supermemory_sync` |
| Company memories | `memory` table (key: `supermemorySync`) |

Sync map structure:
```json
{
  "research_42": {
    "hash": "abc123",
    "updatedAt": "2026-03-01T...",
    "customId": "research_42",
    "memoryId": "mem_xyz"
  }
}
```

Max 150 entries per sync map (auto-prunes oldest).

## Configuration

- **API Key:** `SUPERMEMORY_API_KEY` environment variable
- **File:** `src/lib/supermemory.ts`
