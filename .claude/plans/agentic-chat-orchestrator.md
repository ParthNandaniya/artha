# Artha Agentic Chat — Claude-Code-Exact Implementation Plan

> The prior draft was close but had ceremony that Claude Code doesn't have (`finish()` tool, two-layer delegation, no `TodoWrite`, no `Task` subagent with isolated context). This plan rewrites the architecture to be **exactly how Claude Code works**.

## The one-paragraph summary of how Claude Code actually works

Claude Code is a single agentic loop. The model receives a system prompt (principles, not a workflow), a user message, and a flat set of **primitive tools** (`Read`, `Edit`, `Write`, `Grep`, `Glob`, `Bash`, `WebSearch`, `WebFetch`, `Task`, `TodoWrite`, etc.). On each turn the model can emit zero-or-more `tool_use` blocks; the harness executes them (in parallel if multiple), appends results, and re-invokes the model. The loop ends naturally when the model returns a text-only response (no `tool_use`). **There is no `finish` tool, no classifier, no DAG, no per-task workflow script.** Multi-step planning happens through `TodoWrite` (a checklist the model writes and updates). Context-isolated delegation happens through `Task` (spawns a subagent with its own window, returns one summary). Large artifacts are read incrementally via `Read` with `offset`/`limit`. Risky operations are permission-gated by the harness.

Artha's current chat is the opposite: a classifier picks one or more agents upfront, each agent does a single LLM call to produce output, then the system stops. No iteration, no planning, no composition.

The job is to replace Artha's orchestrator with a Claude-Code-style loop.

---

## Architecture (final)

```
┌──────────────────────────────────────────────────────────────────┐
│  POST /api/chat                                                  │
│    ↓                                                             │
│  runArthaAgent()   ← one unified react loop                      │
│                                                                  │
│  ┌──── system prompt ────┐                                       │
│  │ • Who you are         │                                       │
│  │ • Company context     │                                       │
│  │ • Principles:         │                                       │
│  │   - Prefer Edit > Write                                       │
│  │   - Read before edit  │                                       │
│  │   - Verify before done│                                       │
│  │   - Parallel tools    │                                       │
│  │   - Use TodoWrite for │                                       │
│  │     multi-step work   │                                       │
│  │   - Use Task for deep │                                       │
│  │     research          │                                       │
│  └───────────────────────┘                                       │
│                                                                  │
│  ┌──── tool set (flat) ────────────────────────────────────────┐ │
│  │ Read access:                                                │ │
│  │   Read (path, offset?, limit?)  — universal read            │ │
│  │   Grep (pattern, path?, type?, context?)                    │ │
│  │   Glob (pattern)                                            │ │
│  │                                                             │ │
│  │ Edit access:                                                │ │
│  │   Edit (path, old_string, new_string, replace_all?)         │ │
│  │   Write (path, content)                                     │ │
│  │                                                             │ │
│  │ Side effects (permission-gated):                            │ │
│  │   SendEmail, ScheduleEmail                                  │ │
│  │   PublishSite, UnpublishSite                                │ │
│  │   PostTweet, ScheduleTweet                                  │ │
│  │   CreateStripePlan, UpdateStripePlan                        │ │
│  │   ExecuteSQL (on company DB, read-only by default)          │ │
│  │   SaveLead, DeleteLead                                      │ │
│  │   ScheduleTask (for worker to run later)                    │ │
│  │                                                             │ │
│  │ Research:                                                   │ │
│  │   WebSearch (query, engine?, num_results?)                  │ │
│  │   WebFetch (url, prompt?)                                   │ │
│  │   FindSimilar (url)                                         │ │
│  │                                                             │ │
│  │ Memory / planning:                                          │ │
│  │   TodoWrite (todos[])                                       │ │
│  │   Task (description, prompt, subagent_type)                 │ │
│  │   MemoryWrite (key, content, tags?)                         │ │
│  │   MemorySearch (query, limit?)                              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Loop: call LLM → if tool_use, execute (parallel) → append       │
│         results → loop. Ends when no tool_use returned.          │
└──────────────────────────────────────────────────────────────────┘
```

**That's it.** No orchestrator. No classifier. No DAG. No per-agent sub-loops. The model composes primitives to accomplish whatever the user asked.

Legacy sub-agents (`website_builder`, `research`, `email_writer`, etc.) are **decomposed into these primitives, not wrapped**. Example: the old `website_builder.ts` becomes a set of tool handlers — `Read` over pages, `Edit` and `Write` over HTML, `Grep` over HTML. The "website builder" is no longer a thing; it's just the model using these tools when the user asks for site changes.

---

## The tool set — Claude Code mapping → Artha

Each tool maps one-to-one to the Claude Code pattern, with Artha-specific paths.

### Unified resource path scheme

To reuse `Read`/`Edit`/`Write`/`Grep` across all project artifacts, define a path scheme:

| Path | Artifact | Backed by |
|---|---|---|
| `site:index` | Main landing page HTML | `projects.landing_page_html` + draft |
| `site:{slug}` | Additional pages | `pages` table |
| `site:pricing` | Pricing page special-case | built from `pricing_plans` |
| `docs:mission` | Mission doc | project memory |
| `docs:research/{id}` | Research docs | `documents` table |
| `tasks:` | Task index | `tasks` table |
| `tasks:{id}` | Individual task | `tasks` row |
| `emails:recent` | Last N sent emails | `emails_sent` table |
| `emails:{id}` | Single email | `emails_sent` row |
| `leads:` | Lead list | `leads` table |
| `leads:{id}` | Single lead | `leads` row |
| `analytics:summary` | Analytics summary | `site_analytics` aggregate |
| `memory:{key}` | Supermemory entries | Supermemory API |
| `contacts:` | Email capture contacts | `contacts` table |

`Read("site:index")` returns the HTML. `Edit("site:index", old, new)` does a unique-match edit. `Grep("site:index", "<h1")` returns matches with line numbers. Same API, everywhere.

### Tool definitions

Each is a `ToolDefinition` in the format `agentic-runner.ts` already understands.

#### `Read`
```ts
{
  name: "Read",
  description: "Read an Artha resource by path (e.g. 'site:index', 'docs:mission', 'tasks:abc123', 'emails:recent'). Supports offset and limit for large resources. Use Glob first if you don't know the exact path.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Resource path, e.g. 'site:index'" },
      offset: { type: "number", description: "Line number to start from (0-indexed)" },
      limit: { type: "number", description: "Max lines to return. Default 2000." },
    },
    required: ["path"],
  },
}
```
Implementation dispatches on `path` prefix → reads backing store → returns line-numbered content (same `cat -n` format Claude Code uses, which helps the model do precise edits).

#### `Edit`
```ts
{
  name: "Edit",
  description: "Replace a unique string in a resource. `old_string` MUST match exactly one place in the file — include surrounding context if needed to disambiguate. Use `replace_all` to replace every occurrence. Fails if `old_string` is not found or not unique.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string" },
      old_string: { type: "string" },
      new_string: { type: "string" },
      replace_all: { type: "boolean", default: false },
    },
    required: ["path", "old_string", "new_string"],
  },
}
```
Same semantics as Claude Code's `Edit`: atomic, unique-match, errors with clear guidance if not unique.

Implementation applies the edit to an in-memory workspace keyed by path; doesn't hit the DB until a later explicit save or until loop end (see "Commit model" below).

#### `Write`
```ts
{
  name: "Write",
  description: "Create a new resource or completely overwrite an existing one. Prefer Edit for modifying existing resources — only use Write when creating from scratch or when the whole content is changing. You must Read a resource before overwriting it.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
  },
}
```

#### `Grep`
```ts
{
  name: "Grep",
  description: "Search for a regex pattern across Artha resources. Use path to scope (e.g. 'site:*' for all pages, 'emails:*' for all emails). Output mode 'content' returns matching lines; 'files_with_matches' returns paths.",
  input_schema: {
    type: "object",
    properties: {
      pattern: { type: "string" },
      path: { type: "string", description: "Optional scope like 'site:*' or 'docs:*'. Defaults to all." },
      output_mode: { type: "string", enum: ["content", "files_with_matches", "count"], default: "files_with_matches" },
      context: { type: "number", description: "Lines of context around matches (for content mode)" },
      head_limit: { type: "number" },
    },
    required: ["pattern"],
  },
}
```

#### `Glob`
```ts
{
  name: "Glob",
  description: "List resources matching a pattern. E.g. 'site:*' lists all pages, 'docs:research/*' lists all research docs.",
  input_schema: { type: "object", properties: { pattern: { type: "string" } }, required: ["pattern"] },
}
```

#### `WebSearch` / `WebFetch` / `FindSimilar`
Wrap existing [search.ts](src/lib/search.ts). Same schemas as Claude Code's `WebSearch`/`WebFetch`.

#### `Task` (subagent with isolated context)
```ts
{
  name: "Task",
  description: "Delegate a bounded sub-job to a subagent running in an isolated context window. Use when the sub-job would fill your own context (e.g. exploring many docs, deep competitor research, iterating on a long page). The subagent returns ONE summary. Specify subagent_type to pick a specialist system prompt.",
  input_schema: {
    type: "object",
    properties: {
      description: { type: "string", description: "3-5 word task label" },
      prompt: { type: "string", description: "Full self-contained brief — the subagent cannot see your context" },
      subagent_type: {
        type: "string",
        enum: ["general", "explore", "researcher", "site-editor", "email-writer", "lead-hunter"],
        description: "Pick the specialist prompt best matching the task",
      },
    },
    required: ["description", "prompt", "subagent_type"],
  },
}
```
Implementation: spawns another `runArthaAgent` instance with a specialized system prompt and a filtered tool set, in its own context window. Returns just the final text. This is how Claude Code's `Task` works — and critically, the subagent has the same primitive tools (`Read`/`Edit`/`Grep`/etc.), not a different protocol.

Subagent types:
- `general` — all tools
- `explore` — read-only (Read, Grep, Glob, WebSearch, WebFetch) — fast and cheap for "find out X"
- `researcher` — read + web + MemoryWrite
- `site-editor` — read + Edit/Write on `site:*` only
- `email-writer` — read + SendEmail/ScheduleEmail
- `lead-hunter` — web + SaveLead + enrichment

#### `TodoWrite`
```ts
{
  name: "TodoWrite",
  description: "Create or update the user-visible task checklist for this chat turn. Use for any multi-step work to show the user what you're planning and track progress. Each todo has content, status ('pending'|'in_progress'|'completed'), and an active form shown during progress.",
  input_schema: {
    type: "object",
    properties: {
      todos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            content: { type: "string" },
            activeForm: { type: "string", description: "Present-continuous form e.g. 'Researching competitors'" },
            status: { type: "string", enum: ["pending", "in_progress", "completed"] },
          },
          required: ["content", "activeForm", "status"],
        },
      },
    },
    required: ["todos"],
  },
}
```
Implementation: stores in the session scratchpad AND emits a `todos_update` SSE event. UI renders as a live checklist. Claude Code behavior: only ONE todo can be `in_progress` at a time; mark completed immediately when done.

#### Side-effect tools

All side-effect tools follow the same shape:
- Pure operations (no external side effect): always allowed
- Reversible operations (draft a page, save a lead): always allowed
- Irreversible operations (send email, publish site, charge card, delete data): **permission-gated** — the harness emits `permission_request` SSE and pauses for user approval unless pre-authorized for this session

Side-effect tools:

```ts
SendEmail:     { from_scope: "platform"|"company", to: string[], subject: string, body: string }
ScheduleEmail: { ...SendEmail, send_at: string }
PublishSite:   { pages?: string[] }     // publish current draft
UnpublishSite: {}
PostTweet:     { text: string, reply_to?: string }
ScheduleTweet: { text: string, send_at: string }
ExecuteSQL:    { sql: string, dry_run?: boolean }  // on the company's isolated Neon DB
CreateStripePlan, UpdateStripePlan, SetupStripeAccount
SaveLead, DeleteLead, EnrichLead
ScheduleTask: { agent: string, prompt: string, run_at: string }  // worker queue
```

Credit model (see §4 below) deducts per operation, not per LLM call.

#### `MemoryWrite` / `MemorySearch`
Wrap Supermemory. Same semantics as Claude Code's (implicit) memory in its memory files.

---

## The loop engine — changes to `agentic-runner.ts`

The existing runner is already 80% there. Changes required:

### 1. Remove the forced-JSON output parser

Current runner assumes each agent returns JSON it parses into `AgentOutput`. Claude Code doesn't — it returns free-form text once no more tool calls are needed. Change: strip `parseAgentOutput`. The final text IS the answer; it goes straight to chat.

### 2. Natural stopping

Already correct (`agentic-runner.ts:439` breaks when no `tool_use` blocks). Just remove the `finish` special-casing from the prior plan.

### 3. Explicit parallel tool execution

Already correct (`agentic-runner.ts:544` uses `Promise.allSettled`). Add system-prompt guidance: *"If you need to call multiple tools and there are no dependencies between them, make all independent tool calls in parallel in a single response."*

### 4. Context management — trim with tool-awareness

Current `trimMessages` trims the middle of the conversation. Claude Code does this plus specifically truncates large tool results. Add: when estimated tokens exceed threshold, truncate the *tool result content* of older messages first (keep the tool_use / assistant text so the causal chain is visible to the model). Keep last 6 turns verbatim.

### 5. Subagent spawning

`Task` tool implementation needs to recursively invoke the runner with:
- A different system prompt (looked up by `subagent_type`)
- A filtered tool set
- Its own message array (no parent history)
- Bounded iteration count (sub-loops get max 10 iters to prevent exponential blowup)
- Returns the last assistant text

### 6. Permission gating

Wrap side-effect tools with a check:
```ts
async function executeToolWithPermission(tool, input, ctx) {
  if (tool.requiresPermission && !ctx.session.preAuthorized.has(tool.name)) {
    ctx.emit({ event: "permission_request", data: { tool: tool.name, input, sessionId: ctx.sessionId } });
    const decision = await ctx.waitForPermission(tool.name, input);
    if (decision === "deny") return "User denied permission. Do not retry.";
    if (decision === "authorize_all") ctx.session.preAuthorized.add(tool.name);
  }
  return await tool.execute(input, ctx);
}
```
This requires the chat route to support resumption (see §6 Streaming).

### 7. TodoWrite is special-cased

`TodoWrite` results always succeed (no-op on the model side) but emit SSE events to update UI. The returned text to the model is "Todos updated" — the todo state is read back via... actually Claude Code feeds the updated todos back to the model in the tool result. So: after `TodoWrite`, the tool result contains the full updated todo list. The model uses this to track progress.

---

## The system prompt

Written in Claude Code's voice — principles, not procedures.

```
You are Artha, an AI company-builder assistant for this user's project.

You help the founder run their company by reading state, researching, drafting content, editing their website and emails, managing tasks, and executing operations on their behalf.

# Your environment
Project: {company_name}
Domain: {slug}.tryartha.com
Mission: {short_mission}
Stage: {stage}
Credits remaining: {credits}
Active panel: {active_panel}

# Available resources (via Read/Grep/Glob)
- site:index — main landing page HTML
- site:{slug} — additional pages (use Glob "site:*" to list)
- docs:mission, docs:research/* — company docs
- tasks: — task list (Read "tasks:" to list, "tasks:{id}" for detail)
- emails:recent — last 20 sent emails
- leads: — saved leads
- analytics:summary — site traffic
- memory:{key} — persistent company memory

# Tools
Read, Edit, Write, Grep, Glob — inspect and modify resources
WebSearch, WebFetch, FindSimilar — research
SendEmail, ScheduleEmail, PostTweet, ScheduleTweet, PublishSite,
ExecuteSQL, SaveLead, ScheduleTask, CreateStripePlan, etc. — actions
Task — delegate to a specialist subagent in isolated context
TodoWrite — track multi-step work visibly for the user
MemoryWrite, MemorySearch — persistent memory

# How to work

1. **Understand first, then act.** For any non-trivial request, start by Reading relevant resources. For site changes, Read or Grep the page first. For email replies, Read the recent thread.

2. **Prefer Edit over Write.** Surgical changes beat regeneration. Make Edits as small as possible. Preserve existing structure, classes, and attributes.

3. **Parallelize independent work.** If you need to Read 3 pages or WebSearch 4 queries, emit them all in one turn as parallel tool_use blocks. Don't serialize work that has no dependencies.

4. **Use TodoWrite for multi-step requests.** If the user asks for something that needs 3+ steps, start by writing a todo list. Mark exactly one todo as `in_progress` at a time. Mark each completed as soon as it's actually done.

5. **Use Task for depth.** If a subtask would require reading 10+ files or doing 15+ searches, delegate it to a subagent with Task — the subagent runs in an isolated context and returns a summary. Pick the right subagent_type.

6. **Verify before claiming done.** After editing a page, Read the edited section to confirm. After sending an email, confirm the response. Never say "done" without evidence.

7. **Side effects need explicit user benefit.** Don't send emails, publish sites, post tweets, or run DB operations unless the user's request clearly requires it. When it's ambiguous, ask.

8. **Stop when done.** When the task is complete, stop calling tools and respond with a concise summary (1-3 sentences). Don't pad. Don't re-state what you did step-by-step — the UI already shows the tool calls.

# Credit awareness
Every tool call costs credits. Web searches cost {web_cost}, LLM reasoning costs {reasoning_cost}/call, side effects vary. Be efficient. If a read-only path can answer the question, don't run 8 searches.

# User's request follows.
```

Short and principled. No "step 1, step 2." The model figures out the sequence.

---

## Commit model — in-memory workspace

All `Edit`/`Write`/`Delete` ops on `site:*`, `docs:*`, `tasks:*`, `leads:*` modify an **in-memory session workspace**, not the DB. The workspace commits on one of:

1. Model stops calling tools (loop ends) → auto-commit
2. User approves a `PublishSite` → commit + publish
3. Explicit `SaveDraft` tool called (for partial commits mid-loop) → commit

On commit:
- Diff is computed per resource
- DB writes wrapped in a transaction
- If any write fails, the whole commit rolls back and the error goes back to the loop as a tool result

This is how Claude Code's `Edit`/`Write` feel atomic and reversible. The user's DB state never enters a partial state from a mid-loop crash.

---

## End-to-end request trace

**User**: "Research our 3 biggest competitors, rewrite the landing page headline to contrast against their weakest positioning, and schedule a follow-up email to our waitlist about the change."

```
turn 1  model sees system prompt + user message
        → emits 2 tool_use blocks in parallel:
            • TodoWrite({todos: [
                {content: "Research top 3 competitors", status: "in_progress", activeForm: "Researching competitors"},
                {content: "Rewrite headline based on findings", status: "pending", activeForm: "Rewriting headline"},
                {content: "Schedule follow-up email to waitlist", status: "pending", activeForm: "Scheduling email"},
              ]})
            • Read("docs:mission")   — to ground the research
        harness executes both in parallel → tool results appended

turn 2  → emits Task({
            description: "Competitor weakness analysis",
            prompt: "Research top 3 competitors of {company}. For each, identify their landing page headline and what the weakest aspect of their positioning is (e.g. vague, buried pricing, no proof). Return a short matrix: competitor / headline / weakness.",
            subagent_type: "researcher"
          })
        — spawns sub-loop in isolated context
        — sub-loop: 4 WebSearch (parallel), 3 WebFetch (parallel), 2 more searches, MemoryWrite
        — sub-loop returns: "Competitor A: 'Build faster' (vague, no specifics). Competitor B: 'Launch your dream' (aspirational, zero concrete outcomes). Competitor C: 'Your startup, simplified' (buzzword, no differentiation). Common weakness: ALL use aspirational abstractions instead of specific outcomes."
        harness appends summary to main context

turn 3  → emits 2 parallel tool_uses:
            • TodoWrite — marks #1 completed, #2 in_progress
            • Grep("site:index", "<h1", context=3)

turn 4  → sees grep result: headline is <h1 class="hero-title text-5xl">Build your company faster</h1>
        → emits Edit("site:index",
            old_string: '<h1 class="hero-title text-5xl">Build your company faster</h1>',
            new_string: '<h1 class="hero-title text-5xl">Your company launched in 7 days — mission, site, first 100 leads — concrete, not aspirational.</h1>'
          )

turn 5  → TodoWrite (#2 completed, #3 in_progress)
        → Read("emails:recent", limit=5)  — to match tone

turn 6  → ScheduleEmail({
            from_scope: "company",
            to: ["waitlist"],
            subject: "We heard you — here's what changed",
            body: "...",
            send_at: "+2d"
          })
        — harness checks permission: ScheduleEmail is irreversible → pauses
        — emits permission_request SSE
        — user clicks "authorize" in UI → harness resumes
        — tool executes, returns {scheduled: true, id: ..., sendAt: ...}

turn 7  → TodoWrite (#3 completed)
        → model stops calling tools
        → returns text: "Done. Updated the headline to contrast with the 3 competitors' vague aspirational copy, and scheduled a follow-up email to your waitlist for 2 days from now. Preview: https://{slug}.tryartha.com?draft=1"

harness ends loop → auto-commits workspace → emits `done` SSE
```

Total: 7 turns, 1 Task subagent (isolated, ~6 tool calls inside), 1 permission prompt, clean stop. Exactly how Claude Code works.

---

## File-by-file plan

### New files

| File | Purpose |
|---|---|
| `src/lib/agents/runtime/runtime.ts` | `runArthaAgent()` — the single entry point. Loads system prompt, tool set, runs the loop via `agentic-runner.ts`. |
| `src/lib/agents/runtime/system-prompt.ts` | Main + subagent system prompts. |
| `src/lib/agents/runtime/tool-set.ts` | Assembles the primitive tool list, filters by subagent type. |
| `src/lib/agents/runtime/workspace.ts` | In-memory per-session workspace. `read(path)`, `edit(path, old, new)`, `write(path, content)`, `glob(pattern)`, `grep(pattern, path?)`, `commit()`, `rollback()`. Dispatches on path prefix. |
| `src/lib/agents/runtime/path-resolver.ts` | Maps paths (`site:index`, `tasks:*`, etc.) to backing-store read/write functions. |
| `src/lib/agents/runtime/tools/read-edit-write.ts` | `Read`, `Edit`, `Write` handlers (delegate to workspace). |
| `src/lib/agents/runtime/tools/grep-glob.ts` | `Grep`, `Glob` handlers. |
| `src/lib/agents/runtime/tools/web.ts` | `WebSearch`, `WebFetch`, `FindSimilar` — wrap [search.ts](src/lib/search.ts). |
| `src/lib/agents/runtime/tools/todo.ts` | `TodoWrite` with SSE emission. |
| `src/lib/agents/runtime/tools/task.ts` | `Task` — recursive subagent spawn. |
| `src/lib/agents/runtime/tools/memory.ts` | `MemoryWrite`, `MemorySearch`. |
| `src/lib/agents/runtime/tools/side-effects.ts` | `SendEmail`, `ScheduleEmail`, `PublishSite`, `PostTweet`, `ScheduleTweet`, `ExecuteSQL`, `CreateStripePlan`, `SaveLead`, `ScheduleTask`, etc. All marked `requiresPermission: true` where irreversible. |
| `src/lib/agents/runtime/permission.ts` | Permission gate: emits `permission_request`, waits for reply via a pending-permissions map keyed by session ID. |
| `src/lib/agents/runtime/credit-ledger.ts` | Token-based + per-operation cost accounting. |
| `src/lib/agents/runtime/audit.ts` | Writes `agent_runs` rows (schema below). |
| `src/lib/agents/runtime/session.ts` | Session type: `{ id, projectId, userId, preAuthorized: Set<string>, scratchpad, workspace, emit, signal }`. |
| `src/app/api/chat/permission/route.ts` | POST endpoint to accept permission decisions from UI; routes to the pending-permissions map so the paused agent can resume. |
| `schema/platform.sql` | Add `agent_runs` and `pending_permissions` tables. |

### Modified files

| File | Change |
|---|---|
| `src/app/api/chat/route.ts` | Replace `orchestrateChat(...)` call with `runArthaAgent(...)` (behind `USE_ARTHA_AGENT=1` flag initially). |
| `src/lib/agents/framework/agentic-runner.ts` | Remove `parseAgentOutput` JSON-forcing; make final text the output. Add tool-result-specific trimming. Add `onToolResult` and `onIteration` hooks. Add session-aware permission gate. |
| `src/lib/agents/types.ts` | New SSE events: `todos_update`, `permission_request`, `permission_resolved`, `tool_call_start`, `tool_call_done`, `workspace_diff`, `credits_tick`. |
| `src/components/chat/chat-sidebar.tsx` | Render todo list from `todos_update`. Render permission prompt inline. Live credits pill. Tool-call timeline (collapsible). |
| `src/lib/website.ts` | Add `getPageBySlug`, `upsertProjectPage`, `deleteProjectPage` (used by path-resolver for `site:*`). |
| `src/lib/neon.ts` | Expose a per-company DB handle factory (for `ExecuteSQL` tool). |
| `package.json` | Add `htmlparser2`, `domutils`, `dom-serializer`, `css-select` for HTML resource handling. |

### Deleted files (post-rollout, after flag 100%)

| File | Reason |
|---|---|
| `src/lib/agents/orchestrator.ts` (most of it) | `classifyIntent`, `buildPlan`, `executeAgents`, direct-answer path all replaced by `runArthaAgent`. Keep `AGENT_RUNNERS` until phase 3 cleanup if any worker jobs still use it. |
| `src/lib/agents/website-builder.ts` | Logic moves to `site:*` path handlers. |
| `src/lib/agents/research.ts` | Logic moves to `researcher` subagent_type — it's just a different system prompt + same tools. |
| `src/lib/agents/email-writer.ts` | Logic moves to `email-writer` subagent + `SendEmail` tool. |
| `src/lib/agents/lead-finder.ts` | Logic moves to `lead-hunter` subagent + `SaveLead`/web tools. |
| `src/lib/agents/task-generator.ts` | Becomes a subagent_type or inlined in main loop — `TodoWrite` + reading analytics + writing to `tasks:` via `Write`. |

Sub-agents that stay as-is (for now): `artha_*` ops agents (run via cron, not chat), `stripe_agent` (compliance sensitivity — keep the single-shot flow until we have robust permission UX for payment ops).

---

## Schema changes

```sql
-- Track every agent run for debugging, replay, and cost analysis
CREATE TABLE agent_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,              -- chat turn id, parent_run_id same for sub-runs
  parent_run_id UUID,                    -- null for top-level, set for Task spawns
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  chat_message_id UUID,
  subagent_type TEXT DEFAULT 'main',
  status TEXT NOT NULL,                  -- 'running' | 'completed' | 'failed' | 'aborted' | 'awaiting_permission'
  iterations INT DEFAULT 0,
  tool_calls JSONB DEFAULT '[]',
  todos JSONB DEFAULT '[]',              -- final TodoWrite state
  input_message TEXT,
  final_response TEXT,
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  thinking_tokens INT DEFAULT 0,
  credits_used NUMERIC(10,4) DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX idx_agent_runs_project ON agent_runs(project_id, started_at DESC);
CREATE INDEX idx_agent_runs_session ON agent_runs(session_id);
CREATE INDEX idx_agent_runs_parent ON agent_runs(parent_run_id);

-- Permission state for paused agent runs
CREATE TABLE pending_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL UNIQUE,
  run_id UUID NOT NULL,
  project_id UUID NOT NULL,
  tool_name TEXT NOT NULL,
  tool_input JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,       -- auto-deny after 5 min
  resolved_at TIMESTAMPTZ,
  decision TEXT,                         -- 'allow' | 'allow_all_session' | 'deny'
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_pending_permissions_session ON pending_permissions(session_id, resolved_at);
```

---

## Credit model

Move from per-agent flat cost to per-operation granular cost. Transparent to users via live `credits_tick` events.

| Operation | Cost | Why |
|---|---|---|
| LLM turn (main agent) | 0.05 × (input_tokens + 4×output_tokens) / 1000 | Mirror model pricing, premium |
| LLM turn (subagent) | 0.04 × ... | Slight discount for subagents (isolated context = cheaper) |
| Read / Grep / Glob | 0 | Free, encourages good exploration |
| Edit / Write (on draft) | 0 | Free until commit |
| WebSearch (neural) | 0.1 | Expensive upstream |
| WebSearch (keyword) | 0.05 | Cheaper upstream |
| WebFetch | 0.05 | Proxy + parsing cost |
| SendEmail | 0.1 | Postmark + deliverability risk |
| PostTweet | 0.2 | API cost + reputation risk |
| PublishSite | 0.1 | CDN + domain provisioning |
| ExecuteSQL | 0.05 | Per statement |
| Task (subagent) | accumulates from sub-run | Pass-through |
| MemoryWrite / MemorySearch | 0.02 | Supermemory API |

Hard cap per chat turn: 10 credits. If the loop tries to exceed, abort with a clear "credits exhausted" message and leave the todo list half-done so the user can resume after topping up.

`CreditLedger` tracks running spend; emits `credits_tick` on every tool call. `runArthaAgent` checks before each LLM turn that remaining > 0.

---

## Streaming + interruption + resumption

### SSE events (union)

```ts
| { event: "agent_start", data: { runId, subagent_type } }
| { event: "thinking", data: { step: string } }  // optional thinking text
| { event: "tool_call_start", data: { runId, callId, name, argsPreview } }
| { event: "tool_call_done", data: { runId, callId, resultSummary, durationMs } }
| { event: "todos_update", data: { todos: Todo[] } }
| { event: "permission_request", data: { sessionId, tool, input, runId } }
| { event: "permission_resolved", data: { sessionId, decision } }
| { event: "workspace_diff", data: { path, changeType: "modified"|"created"|"deleted", bytesDelta } }
| { event: "subagent_spawn", data: { parentRunId, childRunId, description, subagent_type } }
| { event: "subagent_done", data: { childRunId, summary } }
| { event: "credits_tick", data: { used, remaining } }
| { event: "text_stream", data: { chunk } }  // final assistant text streaming
| { event: "done", data: { runId, finalText, creditsUsed, creditsRemaining, commits: {path, changeType}[] } }
| { event: "error", data: { error, runId } }
```

### Interruption

`request.signal.aborted` threads through `session.signal`. The loop checks before every LLM call and before every tool call. On abort:
- Mark the current run as `aborted` in `agent_runs`
- Rollback the workspace
- Emit `error` with code `aborted`
- Return HTTP 200 with a cancelled chat_messages row (existing behavior)

### Resumption for permissions

When a side-effect tool triggers permission:
1. Harness writes `pending_permissions` row, `status: awaiting_permission` on `agent_runs`
2. SSE `permission_request` emitted, stream closes gracefully
3. UI renders approve/deny buttons in the chat bubble
4. User clicks → POST `/api/chat/permission` with `sessionId, decision`
5. Server marks permission resolved, finds the parked session, resumes the loop
6. A new SSE stream opens (server sends the event stream for the resumed run)
7. Loop continues from where it stopped, with the tool result now filled in

This requires the session state to be serializable so we can park it across HTTP requests. Phase-1 scope: skip the resumption flow entirely — permission-required tools just decline without the user ever approving, and we document that. Phase 2: implement full resumption.

---

## Rollout phases

Sized so each phase is independently shippable and reversible.

### Phase 1 — Minimum viable Claude-Code clone (no permission resumption, no Task subagent)

Ship: primitive tools (Read, Edit, Write, Grep, Glob, WebSearch, WebFetch, TodoWrite, MemoryWrite/Search, ScheduleTask), `runArthaAgent` loop, flag-gated route.

Omits: `Task`, side-effect tools that need permission (SendEmail, PublishSite, PostTweet — will stub as "not yet authorized in agentic mode"), multi-company-DB ExecuteSQL.

Tests:
- Unit: each tool handler against mocked deps
- Golden: 20 scripted Anthropic responses, assert correct tool executions and SSE events
- Integration: flag on, real Anthropic, run 15 representative prompts, diff against old pipeline

Exit criteria: on the 15 test prompts, new pipeline matches or beats old on an LLM-judge rubric (correctness + quality) ≥80%, within 1.5x latency.

### Phase 2 — Task subagent + permission resumption

Add: `Task` tool with subagent_types, permission resumption across HTTP requests, `SendEmail`/`PublishSite`/`PostTweet` wired up.

Exit criteria: permission flow works end-to-end on localhost and staging; Task reduces main-context growth by ≥40% on research-heavy prompts.

### Phase 3 — Full rollout + legacy cleanup

Flag to 100%. After 30 days of stability, delete `orchestrateChat`, `classifyIntent`, `executeAgents`, individual sub-agent files. Keep `AGENT_RUNNERS` map only if worker cron jobs still use it (those don't need to change; they call agents directly, not through chat).

### Phase 4 — Long-horizon autonomy (stretch)

Add: `ScheduleTask` writing to worker queue so the agent can say "follow up in 3 days if traffic drops." Cron-spawned proactive runs ("Review project state, take action if warranted"). Cross-turn memory via persistent `agent_runs` lookups.

---

## Eval + observability

### Eval harness

`scripts/agent-eval/`
- `fixtures.jsonl` — 30 labeled prompts with expected outcome classes (email sent, site edited, research doc written, etc.)
- `run.ts` — runs each through old and new pipelines, captures transcripts, latencies, token counts
- `judge.ts` — LLM-judge rubric scoring correctness (did it do the right thing?) and quality (is the artifact good?)
- CI gate: new pipeline must score ≥80% match on correctness and ≥90% of old's quality

### Debugging UI

`/admin/runs/{runId}` page (gated to staff) that shows:
- Full transcript (messages, tool_uses, tool_results, thinking)
- Per-iteration token/latency breakdown
- Workspace diff
- Permission events

Writes come for free from the `agent_runs` + `pending_permissions` tables.

---

## Things the user needs to decide before I start building

1. **Scope of phase 1**: accept the "no side-effect tools" limitation to ship faster, or hold phase 1 until permission resumption works so side-effects are available? My recommendation: ship phase 1 without side effects — having `TodoWrite`, `Task` (phase 2), and read/edit-only side effects already demos the "truly agentic" behavior and lets you validate the loop. Side effects in phase 2.

2. **Temperature / determinism**: Claude Code runs at low temperature for consistency. Same here? My recommendation: yes — temperature 0.2 on main loop, 0.3 on subagents.

3. **Context window per loop**: Claude Code uses Claude's 200k-token context effectively. Artha currently uses GPT and Claude mixed. My recommendation: pin main loop to `claude-opus-4-7` (1M context, best tool-use) and subagents to `claude-sonnet-4-6` (cheaper, still great). Reject OpenAI tool-use paths for the loop — OpenAI tool calling is fine but Anthropic's has richer streaming primitives that match what we want.

4. **Credit pricing transparency**: show each tool call's cost inline in the UI? My recommendation: show a running total pill; let users click to expand per-tool breakdown. Matches Claude Code's cost visibility without being noisy.

5. **Legacy agent preservation**: are any of the old sub-agents used by things *other* than chat (cron jobs, worker pipeline)? If yes, keep `AGENT_RUNNERS` and the existing sub-agent files until those consumers migrate. Worth a quick audit of `src/worker/` before phase 3 cleanup.

---

## Why this is actually Claude Code and not a facsimile

Concrete checklist — if you can't answer "yes" to each, it's not Claude Code:

- [x] One unified loop; no upfront classification
- [x] Flat primitive tools (Read/Edit/Write/Grep/Glob/Bash-equivalent)
- [x] Natural stopping — no `finish` tool
- [x] `Task` spawns subagent in isolated context with its own tool set
- [x] `TodoWrite` provides visible multi-step planning
- [x] Parallel tool calls encouraged, executed concurrently
- [x] System prompt is principles (prefer Edit, parallel, verify) not procedures
- [x] Context management via `Read` offset/limit and middle-message trimming
- [x] Permission gating for irreversible operations
- [x] Workspace semantics — edits are in-memory, atomic on commit
- [x] Streaming tool calls + interruption supported
- [x] No forced JSON output — final response is whatever the model says

This plan ticks all of them. Ready to build when you give the green light.
