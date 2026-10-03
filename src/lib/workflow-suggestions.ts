/**
 * Phase 3: Connected Workflows
 *
 * Pure function mapping completed actions to suggested next steps.
 * No AI calls — just routing logic.
 */

export interface WorkflowSuggestion {
  id: string;
  label: string;
  description: string;
  /** Either a panel to navigate to, or a chat message to pre-fill */
  action:
    | { type: "panel"; panel: string }
    | { type: "chat"; message: string }
    | { type: "inline"; inlineAction: string; context: Record<string, unknown> };
}

type CompletedActionType =
  | "research_completed"
  | "lead_enriched"
  | "lead_found"
  | "email_sent"
  | "email_replied"
  | "website_updated"
  | "task_completed"
  | "tasks_suggested";

interface CompletedAction {
  type: CompletedActionType;
  context?: Record<string, unknown>;
}

export function getWorkflowSuggestions(action: CompletedAction): WorkflowSuggestion[] {
  switch (action.type) {
    case "research_completed":
      return [
        {
          id: "find-leads-after-research",
          label: "Find leads in this space",
          description: "Use research insights to find potential customers",
          action: { type: "chat", message: "Find leads based on the latest research" },
        },
        {
          id: "draft-outreach-after-research",
          label: "Draft outreach strategy",
          description: "Create email templates based on findings",
          action: { type: "chat", message: "Draft an outreach email strategy based on the latest research" },
        },
      ];

    case "lead_found":
    case "lead_enriched": {
      const leadName = action.context?.leadName as string | undefined;
      return [
        {
          id: "draft-intro-email",
          label: leadName ? `Email ${leadName}` : "Draft intro email",
          description: "Send a personalized introduction",
          action: {
            type: "chat",
            message: leadName
              ? `Draft a personalized intro email to ${leadName}`
              : "Draft intro emails to the newest leads",
          },
        },
        {
          id: "research-lead-company",
          label: "Research their company",
          description: "Deep dive into the lead's company",
          action: {
            type: "chat",
            message: leadName
              ? `Research ${action.context?.leadCompany || leadName}'s company`
              : "Research the companies of our latest leads",
          },
        },
      ];
    }

    case "email_sent":
      return [
        {
          id: "schedule-followup",
          label: "Schedule follow-up",
          description: "Set a reminder to follow up in 3 days",
          action: { type: "chat", message: "Create a follow-up task for the email I just sent, due in 3 days" },
        },
      ];

    case "email_replied":
      return [
        {
          id: "update-lead-status",
          label: "Update lead status",
          description: "Mark this lead as replied",
          action: { type: "panel", panel: "leads" },
        },
        {
          id: "draft-follow-up",
          label: "Draft follow-up",
          description: "Continue the conversation",
          action: { type: "chat", message: "Draft a follow-up reply to the latest email thread" },
        },
      ];

    case "website_updated":
      return [
        {
          id: "deploy-website",
          label: "Deploy changes",
          description: "Push the latest updates live",
          action: { type: "panel", panel: "landing-page" },
        },
        {
          id: "share-update",
          label: "Share the update",
          description: "Tweet about the website changes",
          action: { type: "chat", message: "Draft a tweet announcing our website update" },
        },
      ];

    case "task_completed":
      return [
        {
          id: "suggest-next-tasks",
          label: "What's next?",
          description: "Get AI suggestions for next steps",
          action: {
            type: "inline",
            inlineAction: "suggest_next_steps",
            context: {},
          },
        },
      ];

    case "tasks_suggested":
      return [
        {
          id: "view-tasks",
          label: "View task queue",
          description: "See all queued tasks",
          action: { type: "panel", panel: "tasks" },
        },
      ];

    default:
      return [];
  }
}
