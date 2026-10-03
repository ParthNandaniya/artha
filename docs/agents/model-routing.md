# Model Routing

Artha uses a dynamic model selection system to balance cost, quality, and speed across different AI tasks.

## Configuration

Model routing is defined in `src/config/agent-models.ts` and managed by `src/lib/ai/agent-model-router.ts`.

## Model Selection Strategy

| Task Category | Recommended Model | Reasoning |
|---------------|-------------------|-----------|
| **Research** (market, user, competitive) | OpenAI GPT-5.4 | Strong reasoning for analysis, good with web search results |
| **Website Builder** | OpenAI GPT-5 | High-quality HTML/CSS generation |
| **Email Writer** (digest, outreach) | OpenAI GPT-5.4 | Natural writing, professional tone |
| **Task Generator** | Anthropic Haiku 4.5 | Lightweight, fast for structured output |
| **Twitter** | OpenAI GPT-5.4 | Concise, engaging copy |
| **Chat** (direct answers) | Anthropic Sonnet | Fast, balanced for conversation |
| **Chat** (task orchestration) | OpenAI GPT-5.4 | Complex multi-step reasoning |
| **Mission Generation** | OpenAI GPT-5.4 | Strategic, high-quality prose |
| **Lead Finder** | OpenAI GPT-5.4 | Web search comprehension |
| **Database Manager** | Anthropic Sonnet | SQL generation accuracy |
| **Stripe Agent** | Anthropic Sonnet | Structured pricing data |
| **AI Enhance** (form fields) | Anthropic Haiku 4.5 | Fast, cheap for small enhancements |

## Router Implementation

The `agent-model-router.ts` module exposes a function that maps task names to model configurations:

```typescript
type ModelTaskName =
  | "research"
  | "website_builder"
  | "email_writer"
  | "task_generator"
  | "twitter"
  | "chat"
  | "mission"
  | "lead_finder"
  | "database_manager"
  | "stripe_agent"
  | "enhance";
```

Each task resolves to:
- **Provider**: `openai` or `anthropic`
- **Model ID**: Specific model version
- **Max tokens**: Output token limit
- **Temperature**: Creativity setting

## Cost Optimization

1. **Cheap models for lightweight tasks** — Haiku 4.5 for task generation and form enhancement (~10x cheaper than GPT-5)
2. **Sonnet for structured output** — SQL, pricing data, chat replies where speed matters
3. **GPT-5.4 for quality tasks** — Research, email, mission where output quality directly impacts user experience
4. **Output token limits** — Each task type has a max output limit to control costs

## Fallback Behavior

If the primary model fails (rate limit, timeout, API error), the router can fall back:
- OpenAI tasks → Anthropic Sonnet fallback
- Anthropic tasks → OpenAI GPT-5.4 fallback

Fallback is handled at the agent level, not the router level — each agent implementation decides whether to retry with an alternate model.

## Adding a New Agent

1. Add the task name to `ModelTaskName` type
2. Add model configuration in `agent-models.ts`
3. Use `getModelForTask(taskName)` in your agent implementation
4. Set appropriate output token limits for cost control
