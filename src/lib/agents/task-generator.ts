import type { AgentInput, AgentOutput } from "./types";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { validateOutput } from "./framework/validation";
import { getAgenticConfigForSource } from "@/config/agent-agentic-config";
import { multiPass, lightweightCritique } from "@/lib/ai/multi-pass";

interface GeneratedTask {
  title: string;
  description: string;
  type: string;
  tag: string;
  agent: string;
  priority: number;
  revenue_impact?: string;
  depends_on?: string[];
}

export async function runTaskGeneratorAgent(input: AgentInput): Promise<AgentOutput> {
  try {
    const progress = input.onProgress || (() => {});
    const source = (input.metadata?.executionSource as "pipeline" | "chat") || "chat";
    const config = getAgenticConfigForSource("task_generator", source);
    const count = (input.metadata?.count as number) || 5;

    progress("Analyzing company goals...");

    const systemPrompt = `You are a startup advisor and growth strategist acting as a hands-on chief of staff. Generate the ${count} highest-impact tasks that will actually move this company forward right now.

Task generation principles:
- Prioritize by impact-to-effort ratio — what gets the company to its next milestone fastest?
- Think like a growth operator: early-stage companies need traction, signal, and revenue — not polished decks
- Each task must be specific enough to execute without any clarification (e.g. "Cold email 15 B2B SaaS founders who posted about hiring challenges this month" not "do outreach")
- Mix execution types: outreach campaigns, content pieces, research spikes, product pages, social posts
- Consider sequencing: tasks that unlock other tasks (e.g. research → landing page rebuild) should have higher priority
- For each task, write a description that is a genuine execution brief — what to do, how to do it, what good output looks like
- For each task, if it depends on another task being completed first, list those dependency titles in a depends_on array

Return JSON with:
tasks: array of objects:
- title: action-oriented title starting with a verb (e.g. "Cold email 20 Y Combinator founders about X")
- description: detailed execution instructions — specific enough that an AI agent can run it autonomously
- type: one of "outreach", "newsletter", "research", "landing_page", "custom"
- tag: one of "research", "marketing", "cold-outreach", "engineering", "social", "content", "newsletter"
- agent: one of "research", "website_builder", "email_writer", "task_generator", "twitter"
- priority: 1-10 (1 = do this today, 10 = someday/nice to have)
- revenue_impact: one of "direct" (generates revenue), "pipeline" (builds towards revenue), "brand" (awareness)
- depends_on: array of task titles this task depends on (empty array if no dependencies)

Company Context:
${input.context}`;

    const userPromptBase = input.prompt || "Generate the highest-impact tasks for this company right now";

    try {
      const multiPassResult = await multiPass<{ tasks: GeneratedTask[] }>({
        // No separate research — context is already provided in input.context
        generateFn: async () => {
          return generateAgentJSON<{ tasks: GeneratedTask[] }>(
            "task_generator",
            systemPrompt,
            userPromptBase,
            { maxTokens: 3000 },
          );
        },

        critiqueFn: async (output) => {
          const taskSummary = (output.tasks || [])
            .map(
              (t, i) =>
                `${i + 1}. [P${t.priority}] ${t.title} (${t.type}/${t.tag}) — ${t.revenue_impact || "unknown"}`,
            )
            .join("\n");

          return lightweightCritique(
            taskSummary,
            "Generate specific, actionable startup tasks with correct prioritization and diversity",
          );
        },

        refineFn: async (output, feedback) => {
          const currentTasks = (output.tasks || [])
            .map((t) => `- ${t.title} (${t.type}, P${t.priority})`)
            .join("\n");

          const refinePrompt = `${userPromptBase}

PREVIOUS OUTPUT (needs improvement):
${currentTasks}

FEEDBACK:
${feedback}

Regenerate the task list addressing the feedback. Keep any tasks that were good, fix the ones that weren't.`;

          return generateAgentJSON<{ tasks: GeneratedTask[] }>(
            "task_generator",
            systemPrompt,
            refinePrompt,
            { maxTokens: 3000 },
          );
        },

        maxRefinements: 1,
        qualityThreshold: 3.0,
      });

      const tasks = (multiPassResult.result.tasks || []).slice(0, count);

      progress("Generating prioritized action plan...");

      const taskOutput: AgentOutput = {
        success: true,
        agent: "task_generator",
        summary: `Generated ${tasks.length} tasks — top priority: "${tasks[0]?.title || "none"}"`,
        tasksCreated: tasks.map((t) => ({
          title: t.title,
          description: t.description,
          type: t.type,
          tag: t.tag,
          agent: t.agent,
          revenue_impact: t.revenue_impact,
        })),
        links: [{ label: "View tasks", url: "#tasks" }],
      };

      // Structural validation
      const validation = await validateOutput(taskOutput, config, input.prompt);
      if (!validation.passed) {
        taskOutput.summary += ` (validation warnings: ${validation.structuralErrors?.join(", ")})`;
      }

      // Write generated task titles to scratchpad
      if (input.scratchpad) {
        input.scratchpad.write("task_generator.taskTitles", tasks.map((t) => t.title));
      }

      return taskOutput;
    } catch (multiPassError) {
      // Fallback: run the original single-pass generation
      console.warn("[task-generator] Multi-pass failed, falling back to single-pass:", multiPassError);

      const result = await generateAgentJSON<{ tasks: GeneratedTask[] }>(
        "task_generator",
        systemPrompt,
        userPromptBase,
        { maxTokens: 3000 },
      );

      progress("Generating prioritized action plan...");
      const tasks = (result.tasks || []).slice(0, count);

      const taskOutput: AgentOutput = {
        success: true,
        agent: "task_generator",
        summary: `Generated ${tasks.length} tasks — top priority: "${tasks[0]?.title || "none"}"`,
        tasksCreated: tasks.map((t) => ({
          title: t.title,
          description: t.description,
          type: t.type,
          tag: t.tag,
          agent: t.agent,
          revenue_impact: t.revenue_impact,
        })),
        links: [{ label: "View tasks", url: "#tasks" }],
      };

      const validation = await validateOutput(taskOutput, config, input.prompt);
      if (!validation.passed) {
        taskOutput.summary += ` (validation warnings: ${validation.structuralErrors?.join(", ")})`;
      }

      if (input.scratchpad) {
        input.scratchpad.write("task_generator.taskTitles", tasks.map((t) => t.title));
      }

      return taskOutput;
    }
  } catch (error) {
    return {
      success: false,
      agent: "task_generator",
      summary: "Task generation failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
