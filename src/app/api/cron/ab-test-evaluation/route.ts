import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  const tests = await db`
    SELECT * FROM ab_tests WHERE status = 'running'
  `;

  let evaluated = 0;
  let winners = 0;

  for (const test of tests) {
    const testId = test.id as string;
    const projectId = test.project_id as string;
    const minVisitors = (test.min_visitors as number) || 100;

    // Count assignments and conversions per variant
    const stats = await db`
      SELECT
        variant,
        COUNT(*) AS assignments,
        COUNT(*) FILTER (WHERE converted = true) AS conversions
      FROM ab_test_assignments
      WHERE test_id = ${testId}
      GROUP BY variant
    `;

    const variantA = stats.find((s) => s.variant === "a");
    const variantB = stats.find((s) => s.variant === "b");

    const assignmentsA = parseInt((variantA?.assignments as string) || "0", 10);
    const assignmentsB = parseInt((variantB?.assignments as string) || "0", 10);
    const totalAssignments = assignmentsA + assignmentsB;

    // Skip if not enough data
    if (totalAssignments < minVisitors) continue;

    const conversionsA = parseInt((variantA?.conversions as string) || "0", 10);
    const conversionsB = parseInt((variantB?.conversions as string) || "0", 10);

    const rateA = assignmentsA > 0 ? conversionsA / assignmentsA : 0;
    const rateB = assignmentsB > 0 ? conversionsB / assignmentsB : 0;

    // Simple significance check: one variant has >10% better conversion rate
    const threshold = 0.10;
    let winner: "a" | "b" | null = null;

    if (rateA > 0 && rateB > 0) {
      if (rateB > rateA * (1 + threshold)) {
        winner = "b";
      } else if (rateA > rateB * (1 + threshold)) {
        winner = "a";
      }
    } else if (rateA > 0 && rateB === 0) {
      winner = "a";
    } else if (rateB > 0 && rateA === 0) {
      winner = "b";
    }

    if (winner) {
      await db`
        UPDATE ab_tests
        SET status = 'completed', winner = ${winner}, ended_at = NOW()
        WHERE id = ${testId}
      `;

      // If variant B wins, apply it to the landing page
      if (winner === "b" && test.variant_b_html) {
        await db`
          UPDATE projects
          SET landing_page_html = ${test.variant_b_html}
          WHERE id = ${projectId}
        `;
      }

      winners++;
    }

    evaluated++;
  }

  return NextResponse.json({ evaluated, winners });
}
