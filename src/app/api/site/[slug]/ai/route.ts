import { NextRequest } from "next/server";
import {
  handlePreflight,
  createRateLimiter,
  getClientIp,
  getProjectBySlug,
  getWebsiteDb,
  requireSiteUser,
  isErrorResponse,
  jsonResponse,
} from "@/lib/site-api";
import { generateCompletion } from "@/lib/openai";

const isRateLimited = createRateLimiter(10); // 10 req/min per IP

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request);
}

// ── POST: AI completion (deducts credits) ────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const origin = request.headers.get("origin");

  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return jsonResponse({ error: "Too many requests" }, 429, origin);
  }

  const project = await getProjectBySlug(slug);
  if (!project) return jsonResponse({ error: "Not found" }, 404, origin);

  const websiteDb = await getWebsiteDb(slug);
  if (!websiteDb) return jsonResponse({ error: "Database not available" }, 403, origin);

  const userOrError = await requireSiteUser(request, websiteDb, origin);
  if (isErrorResponse(userOrError)) return userOrError;

  let body: {
    prompt?: string;
    system?: string;
    creditCost?: number;
    maxTokens?: number;
    temperature?: number;
    imageUrl?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const prompt = body.prompt;
  if (!prompt || typeof prompt !== "string" || prompt.length > 10000) {
    return jsonResponse({ error: "prompt is required (max 10000 chars)" }, 400, origin);
  }

  const system = typeof body.system === "string" ? body.system.slice(0, 5000) : "";
  const creditCost = typeof body.creditCost === "number" && body.creditCost > 0
    ? Math.min(body.creditCost, 100)
    : 1;
  const maxTokens = typeof body.maxTokens === "number"
    ? Math.min(Math.max(body.maxTokens, 100), 4000)
    : 1000;
  const temperature = typeof body.temperature === "number"
    ? Math.min(Math.max(body.temperature, 0), 1)
    : 0.7;

  // Atomic credit deduction before AI call
  const deductResult = await websiteDb.query(
    `UPDATE site_users SET credits = credits - $1 WHERE id = $2 AND credits >= $1 RETURNING credits`,
    [creditCost, userOrError.id]
  );

  if (deductResult.length === 0) {
    const balanceResult = await websiteDb`
      SELECT credits FROM site_users WHERE id = ${userOrError.id}
    `;
    const balance = Number(balanceResult[0]?.credits) || 0;
    return jsonResponse({ error: "Insufficient credits", balance }, 402, origin);
  }

  const newBalance = Number(deductResult[0].credits);

  // Log credit transaction
  await websiteDb`
    INSERT INTO credit_transactions (site_user_id, amount, type, reason, balance_after)
    VALUES (${userOrError.id}, ${-creditCost}, 'deduction', ${"ai_completion"}, ${newBalance})
  `;

  try {
    // Build user prompt — optionally include image for vision
    let userPrompt = prompt;
    if (body.imageUrl && typeof body.imageUrl === "string") {
      // For vision models, we pass the image as part of the prompt
      userPrompt = `[Image: ${body.imageUrl}]\n\n${prompt}`;
    }

    const result = await generateCompletion(system, userPrompt, {
      model: "gpt-4o-mini",
      temperature,
      maxTokens,
    });

    return jsonResponse(
      { result, credits: newBalance },
      200,
      origin
    );
  } catch (error) {
    // Refund credits on AI failure
    await websiteDb.query(
      `UPDATE site_users SET credits = credits + $1 WHERE id = $2`,
      [creditCost, userOrError.id]
    );
    await websiteDb`
      INSERT INTO credit_transactions (site_user_id, amount, type, reason, balance_after)
      VALUES (${userOrError.id}, ${creditCost}, 'refund', ${"ai_completion_failed"}, ${newBalance + creditCost})
    `;

    return jsonResponse(
      { error: "AI completion failed", details: error instanceof Error ? error.message : "Unknown error" },
      500,
      origin
    );
  }
}
