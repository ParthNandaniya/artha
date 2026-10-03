/**
 * Logo Generation via OpenAI DALL-E 3 / GPT-image-1
 *
 * Generates professional logo variants for a company based on its name,
 * industry, color palette, and style preferences.
 */

import { getOpenAIClient } from "@/lib/openai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogoStyle = "minimal" | "modern" | "playful" | "corporate" | "tech" | "organic";

export interface LogoVariant {
  style: LogoStyle;
  imageUrl: string;
  prompt: string;
}

export interface GenerateLogosInput {
  companyName: string;
  tagline?: string;
  industry?: string;
  primaryColor: string;
  accentColor: string;
  styles?: LogoStyle[];
}

export interface GenerateLogosResult {
  variants: LogoVariant[];
}

// ---------------------------------------------------------------------------
// Prompt engineering
// ---------------------------------------------------------------------------

const STYLE_PROMPTS: Record<LogoStyle, string> = {
  minimal:
    "Minimalist, clean lines, geometric shapes, lots of whitespace, single-weight strokes, flat design",
  modern:
    "Modern and sleek, bold typography, subtle gradients, sharp edges, contemporary feel",
  playful:
    "Friendly and approachable, rounded shapes, vibrant colors, slightly hand-drawn feel, warm personality",
  corporate:
    "Professional and trustworthy, classic design, balanced proportions, serif or clean sans-serif, premium feel",
  tech:
    "Futuristic and innovative, circuit-board inspired elements, angular shapes, digital aesthetic, cutting-edge",
  organic:
    "Natural and organic, flowing curves, leaf or nature-inspired elements, earthy feel, sustainable vibe",
};

function buildLogoPrompt(input: GenerateLogosInput, style: LogoStyle): string {
  const styleDesc = STYLE_PROMPTS[style];
  const industry = input.industry ? ` in the ${input.industry} industry` : "";

  return [
    `Design a professional logo icon for "${input.companyName}"${industry}.`,
    `Style: ${styleDesc}.`,
    `Color palette: primary ${input.primaryColor}, accent ${input.accentColor}, on a pure white background.`,
    `The logo should be a single icon/symbol (no text), vector-style, centered on white background.`,
    `Make it suitable for a favicon, app icon, and website navbar.`,
    `High quality, 1024x1024, professional branding quality.`,
    input.tagline ? `The brand personality conveyed by the tagline: "${input.tagline}".` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * Generate logo variants using OpenAI image generation.
 *
 * Generates one image per style, returning URLs that expire after ~1 hour.
 * The caller should download and persist the images to R2/CDN.
 */
export async function generateLogos(input: GenerateLogosInput): Promise<GenerateLogosResult> {
  const client = getOpenAIClient();
  const styles = input.styles || ["minimal", "modern", "tech", "playful"];
  const variants: LogoVariant[] = [];

  // Generate in parallel (max 4 concurrent)
  const results = await Promise.allSettled(
    styles.map(async (style) => {
      const prompt = buildLogoPrompt(input, style);

      try {
        const response = await client.images.generate({
          model: "dall-e-3",
          prompt,
          n: 1,
          size: "1024x1024",
          quality: "hd",
          style: style === "playful" || style === "organic" ? "natural" : "vivid",
        });

        const imageUrl = response.data?.[0]?.url;
        if (imageUrl) {
          return { style, imageUrl, prompt } as LogoVariant;
        }
        return null;
      } catch (err) {
        console.error(`Logo generation failed for style ${style}:`, err);
        return null;
      }
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      variants.push(result.value);
    }
  }

  return { variants };
}

/**
 * Generate a single logo with a specific style.
 * Useful for regenerating a single variant.
 */
export async function generateSingleLogo(
  input: GenerateLogosInput,
  style: LogoStyle
): Promise<LogoVariant | null> {
  const client = getOpenAIClient();
  const prompt = buildLogoPrompt(input, style);

  try {
    const response = await client.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "hd",
      style: style === "playful" || style === "organic" ? "natural" : "vivid",
    });

    const imageUrl = response.data?.[0]?.url;
    if (imageUrl) {
      return { style, imageUrl, prompt };
    }
    return null;
  } catch (err) {
    console.error(`Logo generation failed for style ${style}:`, err);
    return null;
  }
}
