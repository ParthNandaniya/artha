import { z } from "zod";
import { NextResponse } from "next/server";

// ── Reusable field schemas ──────────────────────────────────────────────────

export const projectIdSchema = z.string().uuid("Invalid project ID");
export const slugSchema = z
  .string()
  .min(3, "Slug must be at least 3 characters")
  .max(63, "Slug must be at most 63 characters")
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "Slug must be lowercase alphanumeric with hyphens, cannot start/end with hyphen");
export const domainSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/,
    "Invalid domain format"
  );

// ── Route-specific schemas ──────────────────────────────────────────────────

export const RunPipelineSchema = z.object({
  prompt: z.string().min(1, "Prompt is required").max(10000, "Prompt too long"),
  url: z.string().url("Invalid URL").optional(),
});

export const CreateProjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name too long"),
  slug: slugSchema,
  status: z.enum(["onboarding", "active", "paused"]).optional().default("onboarding"),
  memory: z.record(z.string(), z.unknown()).optional().default({}),
});

export const UpdateProjectSchema = z.object({
  id: z.string().uuid("Invalid project ID"),
  name: z.string().min(1, "Name is required").max(255, "Name too long"),
});

export const CreateTaskSchema = z.object({
  projectId: projectIdSchema,
  title: z.string().min(1, "Title is required").max(500, "Title too long"),
  description: z.string().max(5000, "Description too long").nullable().optional(),
  isRecurring: z.boolean().optional().default(false),
  recurrenceInterval: z.enum(["daily", "weekly", "biweekly", "monthly"]).optional(),
});

export const GenerateTaskSchema = z.object({
  projectId: projectIdSchema,
});

export const CheckoutSchema = z.object({
  projectId: projectIdSchema,
  plan: z.enum(["pro", "starter", "growth"]).optional().default("pro"),
});

export const CreditPackSchema = z.object({
  projectId: projectIdSchema,
});

export const ChatMessageSchema = z.object({
  projectId: projectIdSchema,
  message: z.string().min(1, "Message is required").max(50000, "Message too long"),
  activePanel: z.string().optional(),
});

export const InviteTeamMemberSchema = z.object({
  projectId: projectIdSchema,
  email: z.string().email("Invalid email address").max(254),
  role: z.enum(["admin", "member", "viewer"]),
});

export const EnhanceFormSchema = z.object({
  projectId: projectIdSchema,
  formType: z.enum(["task", "email", "research", "tweet", "outreach", "lead_note", "research_tag"]),
  currentValues: z.record(z.string(), z.unknown()).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export const CustomDomainSchema = z.object({
  projectId: projectIdSchema,
  domain: domainSchema,
});

export const CustomEmailDomainSchema = z.object({
  projectId: projectIdSchema,
  domain: domainSchema
    .refine((d) => !d.endsWith("tryartha.com"), "Cannot use tryartha.com")
    .refine((d) => !d.endsWith("artha.run"), "Cannot use artha.run"),
});

export const StartWithPromptSchema = z.object({
  prompt: z.string().max(10000, "Prompt too long").optional().default(""),
});

export const WaitlistSchema = z.object({
  email: z.string().email("Invalid email address").max(254),
  source: z.string().max(64).optional().default("homepage_hero"),
});

export const SendEmailSchema = z.object({
  projectId: projectIdSchema,
  to: z.string().email("Invalid recipient email"),
  subject: z.string().min(1, "Subject is required").max(500, "Subject too long"),
  htmlBody: z.string().min(1, "Body is required").max(100000, "Body too long"),
  inReplyTo: z.string().optional(),
  threadId: z.string().uuid().optional(),
});

// ── Helper: parse body and return typed result or error response ─────────

export function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; response: NextResponse } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const firstIssue = result.error?.issues?.[0];
    return {
      success: false,
      response: NextResponse.json(
        { error: firstIssue?.message || "Invalid request body" },
        { status: 400 }
      ),
    };
  }
  return { success: true, data: result.data };
}
