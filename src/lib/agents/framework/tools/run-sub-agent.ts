import type { RegisteredTool, ToolExecutionContext } from "../types";
import type { AgentName } from "@/lib/types";

/**
 * Sub-agent spawning tool. The actual execution is wired up in the AgenticRunner
 * since it needs access to the full agent infrastructure (AGENT_RUNNERS, config, etc.).
 *
 * This file defines the tool schema and a placeholder executor.
 * The real executor is injected by the AgenticRunner at runtime.
 */

const SPAWNABLE_AGENTS: AgentName[] = [
  "research",
  "lead_finder",
  "email_writer",
  "task_generator",
  "twitter",
];

export const runSubAgentTool: RegisteredTool = {
  definition: {
    name: "run_sub_agent",
    description: `Spawn a specialized sub-agent to handle a specific task. Use this when you need another agent's expertise to complete your work. Available agents: ${SPAWNABLE_AGENTS.join(", ")}. The sub-agent will run with the same company context and return its results to you.

Examples:
- Need leads for a competitor you discovered? Spawn lead_finder.
- Need a tweet about a finding? Spawn twitter.
- Need deeper research on a sub-topic? Spawn research.

IMPORTANT: Use sparingly — each sub-agent costs credits and adds latency.`,
    input_schema: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          enum: SPAWNABLE_AGENTS,
          description: "Which agent to spawn.",
        },
        prompt: {
          type: "string",
          description:
            "Detailed instructions for the sub-agent. Be specific about what you need — include relevant context from your current work.",
        },
      },
      required: ["agent", "prompt"],
    },
  },

  // Placeholder — real executor is injected by AgenticRunner
  async execute(
    _input: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<string> {
    return "ERROR: run_sub_agent executor not injected. This is a bug in the AgenticRunner.";
  },
};

export { SPAWNABLE_AGENTS };
