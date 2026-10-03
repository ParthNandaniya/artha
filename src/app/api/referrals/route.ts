import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { incrementProjectCredits } from "@/lib/project-credits";
import crypto from "crypto";

const REFERRAL_CREDITS = 5; // Credits for both referrer and referred

/**
 * GET /api/referrals — Get current user's referral code and stats
 */
export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();

  // Ensure user has a referral code
  let [userData] = await db`SELECT referral_code FROM users WHERE id = ${user.id}`;
  if (!userData?.referral_code) {
    const code = crypto.randomBytes(4).toString("hex");
    await db`UPDATE users SET referral_code = ${code} WHERE id = ${user.id}`;
    userData = { referral_code: code };
  }

  // Get referral stats
  const [stats] = await db`
    SELECT
      COUNT(*) AS total_referrals,
      COUNT(*) FILTER (WHERE status = 'completed') AS completed,
      COALESCE(SUM(CASE WHEN credits_awarded THEN 1 ELSE 0 END), 0)::int AS credits_given
    FROM referrals
    WHERE referrer_user_id = ${user.id}
  `;

  const referrals = await db`
    SELECT r.status, r.created_at, r.completed_at, r.credits_awarded,
           u.name AS referred_name, u.email AS referred_email
    FROM referrals r
    LEFT JOIN users u ON u.id = r.referred_user_id
    WHERE r.referrer_user_id = ${user.id}
    ORDER BY r.created_at DESC
    LIMIT 20
  `;

  return NextResponse.json({
    referralCode: userData.referral_code,
    referralUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://artha.run"}?ref=${userData.referral_code}`,
    stats: {
      totalReferred: Number(stats.total_referrals) || 0,
      completed: Number(stats.completed) || 0,
      creditsEarned: (Number(stats.credits_given) || 0) * REFERRAL_CREDITS,
    },
    referrals: referrals.map((r: Record<string, unknown>) => ({
      name: r.referred_name,
      email: r.referred_email ? `${(r.referred_email as string).split("@")[0].slice(0, 3)}***` : null,
      status: r.status,
      creditsAwarded: r.credits_awarded,
      createdAt: r.created_at,
    })),
  });
}

/**
 * POST /api/referrals — Apply a referral code (called during onboarding)
 * Body: { referralCode: string, projectId: string }
 */
export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { referralCode, projectId } = await request.json();
  if (!referralCode || !projectId) {
    return NextResponse.json({ error: "Missing referralCode or projectId" }, { status: 400 });
  }

  const db = getDb();

  // Can't refer yourself
  const [self] = await db`SELECT referral_code FROM users WHERE id = ${user.id}`;
  if (self?.referral_code === referralCode) {
    return NextResponse.json({ error: "Cannot use your own referral code" }, { status: 400 });
  }

  // Check if already referred
  const existing = await db`SELECT id FROM referrals WHERE referred_user_id = ${user.id}`;
  if (existing.length > 0) {
    return NextResponse.json({ error: "Already used a referral" }, { status: 400 });
  }

  // Find referrer
  const [referrer] = await db`SELECT id FROM users WHERE referral_code = ${referralCode}`;
  if (!referrer) {
    return NextResponse.json({ error: "Invalid referral code" }, { status: 400 });
  }

  // Get referrer's first project for crediting
  const [referrerProject] = await db`
    SELECT id FROM projects WHERE user_id = ${referrer.id} ORDER BY created_at ASC LIMIT 1
  `;

  if (!referrerProject) {
    return NextResponse.json({ error: "Referrer has no projects" }, { status: 400 });
  }

  // Create referral record
  const code = crypto.randomBytes(4).toString("hex");
  await db`
    INSERT INTO referrals (referrer_user_id, referrer_project_id, referral_code, referred_user_id, referred_project_id, status, credits_awarded, completed_at)
    VALUES (${referrer.id}, ${referrerProject.id}, ${code}, ${user.id}, ${projectId}, 'completed', TRUE, NOW())
  `;

  // Award credits to both parties
  await incrementProjectCredits(db, projectId, REFERRAL_CREDITS);
  await incrementProjectCredits(db, referrerProject.id as string, REFERRAL_CREDITS);

  // Mark user as referred
  await db`UPDATE users SET referred_by = ${referrer.id} WHERE id = ${user.id}`;

  return NextResponse.json({
    success: true,
    creditsAwarded: REFERRAL_CREDITS,
    message: `You and your referrer each received ${REFERRAL_CREDITS} bonus credits!`,
  });
}
