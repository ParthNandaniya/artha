import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";

export interface WebsiteDatabaseStats {
  contacts: { total: number; recent: ContactRow[] };
  formSubmissions: { total: number; recent: SubmissionRow[] };
  siteUsers: { total: number };
  sitePayments: { total: number; totalCents: number };
  hasData: boolean;
}

interface ContactRow {
  id: string;
  email: string;
  name: string | null;
  source: string;
  form_slug: string | null;
  created_at: string;
}

interface SubmissionRow {
  id: string;
  form_slug: string;
  data: Record<string, unknown>;
  created_at: string;
}

export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();
  const rows = await db`
    SELECT id FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch all stats in parallel — gracefully handle missing tables
  const [contactsCount, recentContacts, submissionsCount, recentSubmissions, usersCount, paymentsAgg] =
    await Promise.all([
      db`SELECT COUNT(*)::int AS n FROM contacts WHERE project_id = ${projectId}`.catch(() => [{ n: 0 }]),
      db`SELECT id, email, name, source, form_slug, created_at FROM contacts WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 10`.catch(() => []),
      db`SELECT COUNT(*)::int AS n FROM form_submissions WHERE project_id = ${projectId}`.catch(() => [{ n: 0 }]),
      db`SELECT id, form_slug, data, created_at FROM form_submissions WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 10`.catch(() => []),
      db`SELECT COUNT(*)::int AS n FROM site_users WHERE project_id = ${projectId}`.catch(() => [{ n: 0 }]),
      db`SELECT COUNT(*)::int AS n, COALESCE(SUM(amount_cents),0)::int AS total_cents FROM site_payments WHERE project_id = ${projectId} AND status = 'paid'`.catch(() => [{ n: 0, total_cents: 0 }]),
    ]);

  const totalContacts = (contactsCount[0] as { n: number })?.n ?? 0;
  const totalSubmissions = (submissionsCount[0] as { n: number })?.n ?? 0;
  const totalUsers = (usersCount[0] as { n: number })?.n ?? 0;
  const totalPayments = (paymentsAgg[0] as { n: number })?.n ?? 0;
  const totalPaymentCents = (paymentsAgg[0] as { total_cents: number })?.total_cents ?? 0;

  return NextResponse.json<WebsiteDatabaseStats>({
    contacts: {
      total: totalContacts,
      recent: recentContacts as ContactRow[],
    },
    formSubmissions: {
      total: totalSubmissions,
      recent: recentSubmissions as SubmissionRow[],
    },
    siteUsers: { total: totalUsers },
    sitePayments: { total: totalPayments, totalCents: totalPaymentCents },
    hasData: totalContacts > 0 || totalSubmissions > 0 || totalUsers > 0,
  });
}
