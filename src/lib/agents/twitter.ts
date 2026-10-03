import type { AgentInput, AgentOutput } from "./types";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { validateOutput } from "./framework/validation";
import { getAgenticConfigForSource } from "@/config/agent-agentic-config";

/**
 * Composes a clean Phase 1 announcement tweet for posting on Artha's handle.
 * Format: company name — tagline, one sentence about what it does, website URL.
 */
export async function composeAnnouncementTweet(
  companyName: string,
  tagline: string,
  description: string,
  slug: string
): Promise<string> {
  const result = await generateAgentJSON<{ tweet: string }>(
    "twitter",
    `You are writing a short, clean announcement tweet for a new company being shared on Artha's Twitter handle.

Format (follow exactly — no deviations):
{companyName} — {tagline}

{one sentence: what it does and who it's for}

{websiteUrl}

Rules:
- Use the company name, tagline, and description provided — do not invent details
- The middle sentence must be one clear sentence describing the product and its target user
- No hashtags, no emojis, no filler phrases
- Total tweet must be ≤280 characters
- Return JSON with: tweet (the composed tweet string)`,
    `Company: ${companyName}\nTagline: ${tagline}\nDescription: ${description}\nWebsite: ${slug}.tryartha.com`
  );

  if (result.tweet.length > 280) {
    return result.tweet.slice(0, 277) + "...";
  }
  return result.tweet;
}

export async function runTwitterAgent(input: AgentInput): Promise<AgentOutput> {
  try {
    const progress = input.onProgress || (() => {});
    const source = (input.metadata?.executionSource as "pipeline" | "chat") || "chat";
    const config = getAgenticConfigForSource("twitter", source);
    const isThread = input.prompt.toLowerCase().includes("thread");

    if (isThread) {
      progress("Crafting tweet thread...");
      const result = await generateAgentJSON<{
        tweets: string[];
        summary: string;
      }>(
        "twitter",
        `You are a startup's Twitter content strategist specializing in build-in-public threads that grow audiences and build credibility.

Thread rules — follow every one:
- Write 4-6 tweets (not fewer — depth is what makes threads worth reading)
- Tweet 1 (hook): lead with a surprising insight, a bold specific claim, or a concrete number — NO "I'm going to share X things about Y"
- Tweets 2-4 (substance): specific details, behind-the-scenes stories, hard-won learnings, real data points — make each tweet standalone interesting
- Tweet 5 (optional pivot): a counterintuitive takeaway or the biggest lesson
- Last tweet (CTA): invite engagement — ask a question, link to the product, or tell people to follow for more
- Each tweet ≤280 characters (hard limit — count carefully)
- Tone: authentic, specific, human — like a founder writing at 11pm, not a marketing team writing Monday morning
- Max 2 relevant hashtags, only on the very last tweet
- Include the product URL from context when it adds value (usually on the last tweet)
- AVOID: generic statements, filler phrases, corporate tone, starting every tweet with "2/"

Return JSON with:
- tweets: array of tweet strings (each ≤280 chars, verified)
- summary: what this thread is about and why it will resonate with this audience

Company Context:
${input.context}`,
        input.prompt
      );

      // Truncate any tweets exceeding 280 chars
      const tweets = result.tweets.map((content, i) => ({
        content: content.length > 280 ? content.slice(0, 277) + "..." : content,
        threadId: i > 0 ? "thread" : undefined,
      }));

      const threadOutput: AgentOutput = {
        success: true,
        agent: "twitter",
        summary: `Thread composed: ${tweets.length} tweets — ${result.summary}`,
        tweets,
        links: [{ label: "View tweets", url: "#twitter" }],
      };

      // Structural validation
      const validation = await validateOutput(threadOutput, config, input.prompt);
      if (!validation.passed) {
        threadOutput.summary += ` (validation warnings: ${validation.structuralErrors?.join(", ")})`;
      }

      // Write to scratchpad
      if (input.scratchpad) {
        input.scratchpad.write("twitter.tweetContent", tweets.map((t) => t.content));
      }

      return threadOutput;
    }

    progress("Crafting tweet content...");
    const result = await generateAgentJSON<{
      tweet: string;
      summary: string;
    }>(
      "twitter",
      `You are a startup's Twitter content strategist. Write a single tweet that maximizes engagement and authentically represents the brand.

Tweet rules — follow every one:
- Must be ≤280 characters (hard limit — count the characters before returning)
- Open with a hook in the first 5-8 words — something that stops the scroll (a number, a specific claim, a question, or a bold statement)
- Specific beats generic: use real details, concrete outcomes, or actual product features — not vague value props
- Tone: direct, authentic, human — a real founder/person wrote this, not a press release
- Include company name, handle, or product URL when it genuinely adds value
- Max 2 hashtags (zero is often better unless the topic has a strong hashtag community)
- DO NOT start with: "Excited to", "Proud to", "Thrilled to", "We are pleased to", "Introducing"

Return JSON with:
- tweet: the tweet text (≤280 chars, character count verified)
- summary: what this tweet is about and the specific engagement angle it uses

Company Context:
${input.context}`,
      input.prompt
    );

    progress("Optimizing for engagement...");
    if (result.tweet.length > 280) {
      const truncated = result.tweet.slice(0, 277) + "...";
      result.tweet = truncated;
    }

    const tweetOutput: AgentOutput = {
      success: true,
      agent: "twitter",
      summary: `Tweet composed: "${result.tweet.slice(0, 60)}..."`,
      tweets: [{ content: result.tweet }],
      links: [{ label: "View tweet", url: "#twitter" }],
    };

    // Structural validation
    const validation = await validateOutput(tweetOutput, config, input.prompt);
    if (!validation.passed) {
      tweetOutput.summary += ` (validation warnings: ${validation.structuralErrors?.join(", ")})`;
    }

    // Write to scratchpad
    if (input.scratchpad) {
      input.scratchpad.write("twitter.tweetContent", result.tweet);
    }

    return tweetOutput;
  } catch (error) {
    return {
      success: false,
      agent: "twitter",
      summary: "Tweet composition failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
