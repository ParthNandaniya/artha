import { generateAgentCompletion } from "@/lib/ai/agent-model-router";
import type { ModelTaskName } from "@/lib/types";

// ═══════════════════════════════════════════════════════════════════════════
// Content Repurposer Agent — converts content between formats
// ═══════════════════════════════════════════════════════════════════════════

export type ContentFormat =
  | "blog"
  | "twitter_thread"
  | "linkedin_post"
  | "email_newsletter";

export interface RepurposeInput {
  content: string;
  fromFormat: ContentFormat;
  toFormat: ContentFormat;
  companyName: string;
  voiceProfile?: string;
}

export interface RepurposeOutput {
  content: string;
  metadata: {
    wordCount: number;
    format: ContentFormat;
  };
}

const FORMAT_INSTRUCTIONS: Record<
  string,
  { system: string; constraints: string }
> = {
  "blog->twitter_thread": {
    system:
      "You convert blog posts into engaging Twitter threads. Extract the key points and present them as a series of tweets.",
    constraints: `Rules:
- Each tweet MUST be under 280 characters
- Start with a hook tweet that grabs attention
- Number each tweet (1/, 2/, etc.)
- End with a CTA or summary tweet
- 4-8 tweets total
- Use line breaks between tweets
- No hashtag spam (max 1-2 relevant hashtags on the last tweet)`,
  },
  "blog->linkedin_post": {
    system:
      "You convert blog posts into professional LinkedIn posts. Summarize the key insight with a personal/founder angle.",
    constraints: `Rules:
- Maximum 1300 characters total
- Start with a bold opening line (hook)
- Use short paragraphs (1-2 sentences each)
- Include 1 key insight or takeaway
- End with a question or CTA to drive engagement
- Professional but not corporate tone
- No excessive emojis (max 2-3 total)`,
  },
  "blog->email_newsletter": {
    system:
      "You convert blog posts into email newsletter sections. Create an HTML snippet suitable for embedding in a newsletter.",
    constraints: `Rules:
- Return valid HTML (no full document, just the content section)
- Use inline styles for email compatibility
- Include a compelling headline
- 2-3 paragraph summary of the key points
- Include a "Read more" CTA link placeholder
- Use <h2>, <p>, <a>, <strong> tags
- Keep it scannable — use bold for key phrases`,
  },
  "twitter_thread->blog": {
    system:
      "You expand Twitter threads into full blog posts. Each tweet becomes a section, expanded with detail and context.",
    constraints: `Rules:
- 600-1200 words
- Each tweet should expand into at least one paragraph
- Add context, examples, and detail that couldn't fit in tweets
- Use H2 headings to structure sections
- Maintain the thread's narrative flow
- Add an introduction and conclusion
- Return clean HTML content`,
  },
};

/**
 * Repurpose content from one format to another.
 */
export async function repurposeContent(
  input: RepurposeInput
): Promise<RepurposeOutput> {
  const conversionKey = `${input.fromFormat}->${input.toFormat}`;
  const instructions = FORMAT_INSTRUCTIONS[conversionKey];

  if (!instructions) {
    throw new Error(
      `Unsupported conversion: ${input.fromFormat} -> ${input.toFormat}. ` +
        `Supported: ${Object.keys(FORMAT_INSTRUCTIONS).join(", ")}`
    );
  }

  const voiceContext = input.voiceProfile
    ? `\n\n${input.voiceProfile}`
    : "";

  const systemPrompt = `${instructions.system}
You are writing for ${input.companyName}.${voiceContext}

${instructions.constraints}`;

  const userPrompt = `Convert this ${input.fromFormat} content to ${input.toFormat} format:

${input.content}`;

  const result = await generateAgentCompletion(
    "content_planner" as ModelTaskName,
    systemPrompt,
    userPrompt,
    { temperature: 0.7 }
  );

  const wordCount = result.split(/\s+/).filter(Boolean).length;

  return {
    content: result.trim(),
    metadata: {
      wordCount,
      format: input.toFormat,
    },
  };
}
