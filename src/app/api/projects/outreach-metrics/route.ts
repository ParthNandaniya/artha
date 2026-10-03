import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/neon";

export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();

  // Verify ownership
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Get outreach metrics from email_messages + leads
  const [emailStats] = await db`
    SELECT
      COUNT(*) FILTER (WHERE direction = 'outbound') AS total_sent,
      COUNT(*) FILTER (WHERE direction = 'outbound' AND metadata->>'delivered_at' IS NOT NULL) AS delivered,
      COUNT(*) FILTER (WHERE direction = 'outbound' AND metadata->>'opened_at' IS NOT NULL) AS opened,
      COUNT(*) FILTER (WHERE direction = 'outbound' AND metadata->>'bounced_at' IS NOT NULL) AS bounced,
      COUNT(*) FILTER (WHERE direction = 'inbound') AS replies_received
    FROM email_messages
    WHERE project_id = ${projectId}
  `;

  const [leadStats] = await db`
    SELECT
      COUNT(*) AS total_leads,
      COUNT(*) FILTER (WHERE contacted = TRUE) AS contacted,
      COUNT(*) FILTER (WHERE status = 'replied') AS replied,
      COUNT(*) FILTER (WHERE status = 'qualified') AS qualified,
      COUNT(*) FILTER (WHERE status = 'converted') AS converted,
      COUNT(*) FILTER (WHERE status = 'lost') AS lost
    FROM leads
    WHERE project_id = ${projectId}
  `;

  // Weekly comparison
  const [weeklyStats] = await db`
    SELECT
      COUNT(*) FILTER (WHERE direction = 'outbound' AND created_at > NOW() - INTERVAL '7 days') AS sent_7d,
      COUNT(*) FILTER (WHERE direction = 'outbound' AND metadata->>'opened_at' IS NOT NULL AND created_at > NOW() - INTERVAL '7 days') AS opened_7d,
      COUNT(*) FILTER (WHERE direction = 'inbound' AND created_at > NOW() - INTERVAL '7 days') AS replies_7d
    FROM email_messages
    WHERE project_id = ${projectId}
  `;

  const totalSent = Number(emailStats.total_sent) || 0;
  const opened = Number(emailStats.opened) || 0;

  return NextResponse.json({
    email: {
      totalSent,
      delivered: Number(emailStats.delivered) || 0,
      opened,
      bounced: Number(emailStats.bounced) || 0,
      repliesReceived: Number(emailStats.replies_received) || 0,
      openRate: totalSent > 0 ? Math.round((opened / totalSent) * 100) : 0,
    },
    leads: {
      total: Number(leadStats.total_leads) || 0,
      contacted: Number(leadStats.contacted) || 0,
      replied: Number(leadStats.replied) || 0,
      qualified: Number(leadStats.qualified) || 0,
      converted: Number(leadStats.converted) || 0,
      lost: Number(leadStats.lost) || 0,
    },
    weekly: {
      sent: Number(weeklyStats.sent_7d) || 0,
      opened: Number(weeklyStats.opened_7d) || 0,
      replies: Number(weeklyStats.replies_7d) || 0,
    },
  });
}
