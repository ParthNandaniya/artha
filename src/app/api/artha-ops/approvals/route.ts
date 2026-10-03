import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";

/**
 * GET /api/artha-ops/approvals — List pending approvals
 * POST /api/artha-ops/approvals — Approve or reject an action
 *
 * Auth: Bearer CRON_SECRET (for now — will be replaced with admin auth)
 */

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "pending";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

  const approvals = await db`
    SELECT a.*, r.agent_name AS run_agent, r.trigger AS run_trigger,
           r.output->>'summary' AS run_summary
    FROM artha_ops_approvals a
    JOIN artha_ops_runs r ON r.id = a.run_id
    WHERE a.status = ${status}
    ORDER BY a.created_at DESC
    LIMIT ${limit}
  `;

  return NextResponse.json({ approvals, count: approvals.length });
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { approvalId, action, reviewedBy } = body as {
    approvalId: string;
    action: "approve" | "reject";
    reviewedBy?: string;
  };

  if (!approvalId || !action) {
    return NextResponse.json({ error: "approvalId and action required" }, { status: 400 });
  }

  const db = getDb();
  const newStatus = action === "approve" ? "approved" : "rejected";

  const rows = await db`
    UPDATE artha_ops_approvals
    SET status = ${newStatus},
        reviewed_by = ${reviewedBy || "admin"},
        reviewed_at = NOW()
    WHERE id = ${approvalId} AND status = 'pending'
    RETURNING *
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Approval not found or already processed" }, { status: 404 });
  }

  return NextResponse.json({ approval: rows[0], action: newStatus });
}
