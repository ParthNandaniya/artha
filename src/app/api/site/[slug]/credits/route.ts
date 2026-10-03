import { NextRequest } from "next/server";
import { handlePreflight, createRateLimiter, getClientIp, getProjectBySlug, getWebsiteDb, requireSiteUser, isErrorResponse, jsonResponse } from "@/lib/site-api";

const isRateLimited = createRateLimiter(10);

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request);
}

// ── GET: Check balance ────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const origin = request.headers.get("origin");

  const project = await getProjectBySlug(slug);
  if (!project) return jsonResponse({ error: "Not found" }, 404, origin);

  const websiteDb = await getWebsiteDb(slug);
  if (!websiteDb) return jsonResponse({ error: "Database not available" }, 403, origin);

  const userOrError = await requireSiteUser(request, websiteDb, origin);
  if (isErrorResponse(userOrError)) return userOrError;

  // Get recent transactions
  const transactions = await websiteDb`
    SELECT id, amount, type, reason, balance_after, created_at
    FROM credit_transactions
    WHERE site_user_id = ${userOrError.id}
    ORDER BY created_at DESC
    LIMIT 10
  `;

  return jsonResponse(
    { credits: userOrError.credits, transactions },
    200,
    origin
  );
}

// ── POST: Use credits ─────────────────────────────────────────────────

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

  let body: { amount?: number; reason?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const amount = body.amount;
  if (!amount || typeof amount !== "number" || amount <= 0 || amount > 1000) {
    return jsonResponse({ error: "Amount must be a positive number (max 1000)" }, 400, origin);
  }

  const reason = body.reason?.slice(0, 200) || null;

  // Atomic deduction — race-condition safe
  const result = await websiteDb.query(
    `UPDATE site_users SET credits = credits - $1 WHERE id = $2 AND credits >= $1 RETURNING credits`,
    [amount, userOrError.id]
  );

  if (result.length === 0) {
    // Insufficient credits
    const balanceResult = await websiteDb`
      SELECT credits FROM site_users WHERE id = ${userOrError.id}
    `;
    const balance = Number(balanceResult[0]?.credits) || 0;
    return jsonResponse({ error: "Insufficient credits", balance }, 402, origin);
  }

  const newBalance = Number(result[0].credits);

  // Log transaction
  await websiteDb`
    INSERT INTO credit_transactions (site_user_id, amount, type, reason, balance_after)
    VALUES (${userOrError.id}, ${-amount}, 'deduction', ${reason}, ${newBalance})
  `;

  return jsonResponse({ ok: true, credits: newBalance }, 200, origin);
}
