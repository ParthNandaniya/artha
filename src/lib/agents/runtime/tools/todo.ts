import type { RuntimeToolDefinition, Todo } from "../types";

export const todoWriteTool: RuntimeToolDefinition = {
  name: "TodoWrite",
  description:
    "Create or update the user-visible task checklist for this turn. Use for any multi-step work (3+ steps) so the user can watch progress. Each todo has:\n" +
    "- content: imperative form ('Research competitors')\n" +
    "- activeForm: present continuous form ('Researching competitors')\n" +
    "- status: 'pending' | 'in_progress' | 'completed'\n" +
    "Rules:\n" +
    "- Exactly ONE todo can be 'in_progress' at a time\n" +
    "- Mark a todo 'completed' IMMEDIATELY after actually completing it — do not batch\n" +
    "- Return the full todo list on every update (not a diff)",
  input_schema: {
    type: "object",
    properties: {
      todos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            content: { type: "string" },
            activeForm: { type: "string" },
            status: { type: "string", enum: ["pending", "in_progress", "completed"] },
          },
          required: ["content", "activeForm", "status"],
        },
      },
    },
    required: ["todos"],
  },
  readOnly: true,
  execute: async (input, ctx) => {
    const raw = Array.isArray(input.todos) ? input.todos : [];
    const todos: Todo[] = raw
      .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
      .map((t) => ({
        content: String(t.content || ""),
        activeForm: String(t.activeForm || t.content || ""),
        status: (t.status as Todo["status"]) || "pending",
      }))
      .filter((t) => t.content.length > 0);

    const inProgressCount = todos.filter((t) => t.status === "in_progress").length;
    if (inProgressCount > 1) {
      return {
        content: `Error: ${inProgressCount} todos marked in_progress. Only one todo can be in_progress at a time.`,
        isError: true,
      };
    }

    ctx.session.todos = todos;
    ctx.session.emit({
      event: "tasks_breakdown",
      data: {
        subtasks: todos.map((t, i) => ({
          id: `todo_${i}`,
          agent: "chat_agent",
          description: t.status === "in_progress" ? t.activeForm : t.content,
          status: t.status === "completed" ? "completed" : t.status === "in_progress" ? "running" : "pending",
        })),
      },
    });

    const formatted = todos
      .map((t, i) => `${i + 1}. [${t.status}] ${t.status === "in_progress" ? t.activeForm : t.content}`)
      .join("\n");
    return { content: `Todos updated (${todos.length}):\n${formatted}` };
  },
};
