import { getDb } from "@/lib/neon";

// ═══════════════════════════════════════════════════════════════════════════
// Email A/B Testing
// ═══════════════════════════════════════════════════════════════════════════

export type AbTestStatus = "active" | "completed" | "cancelled";
export type AbTestType = "subject" | "body" | "send_time" | "from_name";
export type Variant = "a" | "b";

export interface AbTest {
  id: string;
  project_id: string;
  test_type: AbTestType;
  variant_a: string;
  variant_b: string;
  status: AbTestStatus;
  winner: Variant | null;
  created_at: string;
  updated_at: string;
}

export interface AbTestResult {
  test_id: string;
  variant: Variant;
  opens: number;
  clicks: number;
  replies: number;
  recipients: number;
}

export interface AbTestWithResults extends AbTest {
  results: {
    a: AbTestResult;
    b: AbTestResult;
  };
}

/** Create a new A/B test for a project. */
export async function createAbTest(
  projectId: string,
  testType: AbTestType,
  variantA: string,
  variantB: string
): Promise<AbTest> {
  const db = getDb();
  const rows = await db`
    INSERT INTO email_ab_tests (project_id, test_type, variant_a, variant_b, status)
    VALUES (${projectId}, ${testType}, ${variantA}, ${variantB}, 'active')
    RETURNING id, project_id, test_type, variant_a, variant_b, status, winner, created_at, updated_at
  `;
  return rows[0] as AbTest;
}

/** Get an A/B test by ID with aggregated results. */
export async function getAbTest(testId: string): Promise<AbTestWithResults | null> {
  const db = getDb();

  const testRows = await db`
    SELECT id, project_id, test_type, variant_a, variant_b, status, winner, created_at, updated_at
    FROM email_ab_tests
    WHERE id = ${testId}
    LIMIT 1
  `;
  if (testRows.length === 0) return null;

  const test = testRows[0] as AbTest;
  const results = await getResultsForTest(db, testId);

  return { ...test, results };
}

/** List all A/B tests for a project. */
export async function listAbTests(projectId: string): Promise<AbTest[]> {
  const db = getDb();
  const rows = await db`
    SELECT id, project_id, test_type, variant_a, variant_b, status, winner, created_at, updated_at
    FROM email_ab_tests
    WHERE project_id = ${projectId}
    ORDER BY created_at DESC
  `;
  return rows as AbTest[];
}

/**
 * Assign a variant to a recipient. Uses a deterministic hash for consistent
 * assignment (same recipient always gets the same variant for a given test).
 */
export async function assignVariant(
  testId: string,
  recipientEmail: string
): Promise<Variant> {
  // Simple hash-based 50/50 split
  const hash = simpleHash(`${testId}:${recipientEmail}`);
  const variant: Variant = hash % 2 === 0 ? "a" : "b";

  const db = getDb();
  await db`
    INSERT INTO email_ab_test_assignments (test_id, recipient_email, variant)
    VALUES (${testId}, ${recipientEmail}, ${variant})
    ON CONFLICT (test_id, recipient_email) DO NOTHING
  `;

  return variant;
}

/**
 * Record a metric result for a specific variant.
 * metric: 'opens' | 'clicks' | 'replies'
 */
export async function recordResult(
  testId: string,
  variant: Variant,
  metric: "opens" | "clicks" | "replies",
  value: number = 1
): Promise<void> {
  const db = getDb();

  // Upsert with static column references per metric to avoid dynamic SQL
  if (metric === "opens") {
    await db`
      INSERT INTO email_ab_test_results (test_id, variant, opens)
      VALUES (${testId}, ${variant}, ${value})
      ON CONFLICT (test_id, variant) DO UPDATE SET
        opens = email_ab_test_results.opens + ${value},
        updated_at = NOW()
    `;
  } else if (metric === "clicks") {
    await db`
      INSERT INTO email_ab_test_results (test_id, variant, clicks)
      VALUES (${testId}, ${variant}, ${value})
      ON CONFLICT (test_id, variant) DO UPDATE SET
        clicks = email_ab_test_results.clicks + ${value},
        updated_at = NOW()
    `;
  } else {
    await db`
      INSERT INTO email_ab_test_results (test_id, variant, replies)
      VALUES (${testId}, ${variant}, ${value})
      ON CONFLICT (test_id, variant) DO UPDATE SET
        replies = email_ab_test_results.replies + ${value},
        updated_at = NOW()
    `;
  }
}

/**
 * Evaluate whether a test has a statistically significant winner.
 * Uses a simplified Z-test on open rates. Returns the winning variant or null.
 */
export async function evaluateWinner(testId: string): Promise<Variant | null> {
  const db = getDb();
  const results = await getResultsForTest(db, testId);

  const { a, b } = results;
  // Need minimum sample size
  if (a.recipients < 30 || b.recipients < 30) return null;

  const rateA = a.recipients > 0 ? a.opens / a.recipients : 0;
  const rateB = b.recipients > 0 ? b.opens / b.recipients : 0;

  // Pooled proportion Z-test
  const pooledRate =
    (a.opens + b.opens) / (a.recipients + b.recipients);
  if (pooledRate === 0 || pooledRate === 1) return null;

  const se = Math.sqrt(
    pooledRate * (1 - pooledRate) * (1 / a.recipients + 1 / b.recipients)
  );
  if (se === 0) return null;

  const z = Math.abs(rateA - rateB) / se;

  // Z > 1.96 => 95% confidence
  if (z < 1.96) return null;

  const winner: Variant = rateA > rateB ? "a" : "b";

  // Persist winner
  await db`
    UPDATE email_ab_tests
    SET winner = ${winner}, status = 'completed', updated_at = NOW()
    WHERE id = ${testId}
  `;

  return winner;
}

// ── Helpers ──────────────────────────────────────────────────────────────

type DbClient = ReturnType<typeof getDb>;

async function getResultsForTest(
  db: DbClient,
  testId: string
): Promise<{ a: AbTestResult; b: AbTestResult }> {
  const resultRows = await db`
    SELECT
      variant,
      COALESCE(SUM(opens), 0)::int AS opens,
      COALESCE(SUM(clicks), 0)::int AS clicks,
      COALESCE(SUM(replies), 0)::int AS replies
    FROM email_ab_test_results
    WHERE test_id = ${testId}
    GROUP BY variant
  `;

  const assignmentCounts = await db`
    SELECT variant, COUNT(*)::int AS recipients
    FROM email_ab_test_assignments
    WHERE test_id = ${testId}
    GROUP BY variant
  `;

  const empty = (v: Variant): AbTestResult => ({
    test_id: testId,
    variant: v,
    opens: 0,
    clicks: 0,
    replies: 0,
    recipients: 0,
  });

  const a = empty("a");
  const b = empty("b");

  for (const row of resultRows) {
    const target = row.variant === "a" ? a : b;
    target.opens = Number(row.opens);
    target.clicks = Number(row.clicks);
    target.replies = Number(row.replies);
  }

  for (const row of assignmentCounts) {
    const target = row.variant === "a" ? a : b;
    target.recipients = Number(row.recipients);
  }

  return { a, b };
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
