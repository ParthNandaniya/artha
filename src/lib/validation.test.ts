import { describe, it, expect } from "vitest";
import {
  RunPipelineSchema,
  CreateProjectSchema,
  UpdateProjectSchema,
  CreateTaskSchema,
  GenerateTaskSchema,
  CheckoutSchema,
  CreditPackSchema,
  ChatMessageSchema,
  InviteTeamMemberSchema,
  EnhanceFormSchema,
  CustomDomainSchema,
  CustomEmailDomainSchema,
  StartWithPromptSchema,
  WaitlistSchema,
  SendEmailSchema,
  parseBody,
} from "./validation";

// ── RunPipelineSchema ───────────────────────────────────────────────────

describe("RunPipelineSchema", () => {
  it("accepts valid prompt", () => {
    const result = RunPipelineSchema.safeParse({ prompt: "Build a SaaS for dog walkers" });
    expect(result.success).toBe(true);
  });

  it("accepts prompt with URL", () => {
    const result = RunPipelineSchema.safeParse({ prompt: "Build this", url: "https://example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects empty prompt", () => {
    const result = RunPipelineSchema.safeParse({ prompt: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing prompt", () => {
    const result = RunPipelineSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects prompt exceeding max length", () => {
    const result = RunPipelineSchema.safeParse({ prompt: "a".repeat(10001) });
    expect(result.success).toBe(false);
  });

  it("rejects invalid URL", () => {
    const result = RunPipelineSchema.safeParse({ prompt: "test", url: "not-a-url" });
    expect(result.success).toBe(false);
  });
});

// ── CreateProjectSchema ─────────────────────────────────────────────────

describe("CreateProjectSchema", () => {
  it("accepts valid project", () => {
    const result = CreateProjectSchema.safeParse({ name: "My Company", slug: "my-company" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("onboarding");
      expect(result.data.memory).toEqual({});
    }
  });

  it("rejects empty name", () => {
    const result = CreateProjectSchema.safeParse({ name: "", slug: "test" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid slug with uppercase", () => {
    const result = CreateProjectSchema.safeParse({ name: "Test", slug: "My-Slug" });
    expect(result.success).toBe(false);
  });

  it("rejects slug starting with hyphen", () => {
    const result = CreateProjectSchema.safeParse({ name: "Test", slug: "-bad-slug" });
    expect(result.success).toBe(false);
  });

  it("rejects slug shorter than 3 chars", () => {
    const result = CreateProjectSchema.safeParse({ name: "Test", slug: "ab" });
    expect(result.success).toBe(false);
  });

  it("accepts valid status override", () => {
    const result = CreateProjectSchema.safeParse({ name: "Test", slug: "test-co", status: "active" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("active");
  });

  it("rejects invalid status", () => {
    const result = CreateProjectSchema.safeParse({ name: "Test", slug: "test-co", status: "deleted" });
    expect(result.success).toBe(false);
  });
});

// ── CreateTaskSchema ────────────────────────────────────────────────────

describe("CreateTaskSchema", () => {
  it("accepts valid task", () => {
    const result = CreateTaskSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      title: "Research competitors",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isRecurring).toBe(false);
    }
  });

  it("rejects non-UUID projectId", () => {
    const result = CreateTaskSchema.safeParse({
      projectId: "not-a-uuid",
      title: "Test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty title", () => {
    const result = CreateTaskSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects title over 500 chars", () => {
    const result = CreateTaskSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      title: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("accepts recurring task with interval", () => {
    const result = CreateTaskSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      title: "Weekly email",
      isRecurring: true,
      recurrenceInterval: "weekly",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid recurrence interval", () => {
    const result = CreateTaskSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      title: "Test",
      recurrenceInterval: "yearly",
    });
    expect(result.success).toBe(false);
  });
});

// ── CheckoutSchema ──────────────────────────────────────────────────────

describe("CheckoutSchema", () => {
  it("defaults to pro plan", () => {
    const result = CheckoutSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.plan).toBe("pro");
  });

  it("accepts valid plan", () => {
    const result = CheckoutSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      plan: "starter",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid plan", () => {
    const result = CheckoutSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      plan: "enterprise",
    });
    expect(result.success).toBe(false);
  });
});

// ── ChatMessageSchema ───────────────────────────────────────────────────

describe("ChatMessageSchema", () => {
  it("accepts valid message", () => {
    const result = ChatMessageSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      message: "Hello, how can I grow my company?",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty message", () => {
    const result = ChatMessageSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      message: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects message over 50k chars", () => {
    const result = ChatMessageSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      message: "a".repeat(50001),
    });
    expect(result.success).toBe(false);
  });
});

// ── InviteTeamMemberSchema ──────────────────────────────────────────────

describe("InviteTeamMemberSchema", () => {
  it("accepts valid invite", () => {
    const result = InviteTeamMemberSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      email: "test@example.com",
      role: "member",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = InviteTeamMemberSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      email: "not-an-email",
      role: "member",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid role", () => {
    const result = InviteTeamMemberSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      email: "test@example.com",
      role: "superadmin",
    });
    expect(result.success).toBe(false);
  });
});

// ── EnhanceFormSchema ───────────────────────────────────────────────────

describe("EnhanceFormSchema", () => {
  it("accepts valid form types", () => {
    const types = ["task", "email", "research", "tweet", "outreach", "lead_note", "research_tag"] as const;
    for (const formType of types) {
      const result = EnhanceFormSchema.safeParse({
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        formType,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid form type", () => {
    const result = EnhanceFormSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      formType: "invalid_type",
    });
    expect(result.success).toBe(false);
  });
});

// ── CustomDomainSchema ──────────────────────────────────────────────────

describe("CustomDomainSchema", () => {
  it("accepts valid domain", () => {
    const result = CustomDomainSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      domain: "example.com",
    });
    expect(result.success).toBe(true);
  });

  it("accepts subdomain", () => {
    const result = CustomDomainSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      domain: "app.example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects domain without TLD", () => {
    const result = CustomDomainSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      domain: "localhost",
    });
    expect(result.success).toBe(false);
  });
});

// ── CustomEmailDomainSchema ─────────────────────────────────────────────

describe("CustomEmailDomainSchema", () => {
  it("rejects tryartha.com subdomain", () => {
    const result = CustomEmailDomainSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      domain: "test.tryartha.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects artha.run domain", () => {
    const result = CustomEmailDomainSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      domain: "sub.artha.run",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid external domain", () => {
    const result = CustomEmailDomainSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      domain: "mail.mycompany.com",
    });
    expect(result.success).toBe(true);
  });
});

// ── WaitlistSchema ──────────────────────────────────────────────────────

describe("WaitlistSchema", () => {
  it("accepts valid email", () => {
    const result = WaitlistSchema.safeParse({ email: "test@example.com" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.source).toBe("homepage_hero");
  });

  it("rejects invalid email", () => {
    const result = WaitlistSchema.safeParse({ email: "not-email" });
    expect(result.success).toBe(false);
  });

  it("accepts custom source", () => {
    const result = WaitlistSchema.safeParse({ email: "a@b.com", source: "blog" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.source).toBe("blog");
  });
});

// ── StartWithPromptSchema ───────────────────────────────────────────────

describe("StartWithPromptSchema", () => {
  it("defaults to empty string", () => {
    const result = StartWithPromptSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.prompt).toBe("");
  });

  it("accepts valid prompt", () => {
    const result = StartWithPromptSchema.safeParse({ prompt: "Build a marketplace" });
    expect(result.success).toBe(true);
  });

  it("rejects prompt over 10k chars", () => {
    const result = StartWithPromptSchema.safeParse({ prompt: "a".repeat(10001) });
    expect(result.success).toBe(false);
  });
});

// ── SendEmailSchema ─────────────────────────────────────────────────────

describe("SendEmailSchema", () => {
  it("accepts valid email data", () => {
    const result = SendEmailSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      to: "recipient@example.com",
      subject: "Hello",
      htmlBody: "<p>Hi there</p>",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid recipient", () => {
    const result = SendEmailSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      to: "not-email",
      subject: "Hello",
      htmlBody: "<p>Hi</p>",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty subject", () => {
    const result = SendEmailSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      to: "a@b.com",
      subject: "",
      htmlBody: "<p>Hi</p>",
    });
    expect(result.success).toBe(false);
  });
});

// ── parseBody helper ────────────────────────────────────────────────────

describe("parseBody", () => {
  it("returns success with valid data", () => {
    const result = parseBody(GenerateTaskSchema, {
      projectId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.projectId).toBe("550e8400-e29b-41d4-a716-446655440000");
    }
  });

  it("returns error response with invalid data", () => {
    const result = parseBody(GenerateTaskSchema, { projectId: "bad" });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Verify it's a NextResponse-like object
      expect(result.response).toBeDefined();
    }
  });

  it("returns error response with null data", () => {
    const result = parseBody(GenerateTaskSchema, null);
    expect(result.success).toBe(false);
  });

  it("returns error response with undefined data", () => {
    const result = parseBody(GenerateTaskSchema, undefined);
    expect(result.success).toBe(false);
  });
});

// ── UpdateProjectSchema ─────────────────────────────────────────────────

describe("UpdateProjectSchema", () => {
  it("accepts valid update", () => {
    const result = UpdateProjectSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "New Name",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID id", () => {
    const result = UpdateProjectSchema.safeParse({
      id: "not-uuid",
      name: "Test",
    });
    expect(result.success).toBe(false);
  });
});

// ── CreditPackSchema ────────────────────────────────────────────────────

describe("CreditPackSchema", () => {
  it("accepts valid projectId", () => {
    const result = CreditPackSchema.safeParse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing projectId", () => {
    const result = CreditPackSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
