import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
const LAST_PROJECT_COOKIE = "artha_last_project_slug";
import { LandingHero } from "@/components/landing/landing-hero";

import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "https://artha.run" },
};
// Waitlist mode — disabled for launch. Set WAITLIST_MODE=true to re-enable.
// const waitlistMode =
//   process.env.NODE_ENV === "production" &&
//   (process.env.WAITLIST_MODE ?? "false") === "true";

export default async function Home() {
  const user = await getSession();
  if (user) {
    const db = getDb();
    const cookieStore = await cookies();
    const preferredSlug = cookieStore.get(LAST_PROJECT_COOKIE)?.value?.trim();

    if (preferredSlug) {
      const preferredProject = await db`
        SELECT slug
        FROM projects
        WHERE user_id = ${user.id}
          AND slug = ${preferredSlug}
        LIMIT 1
      `;

      if (preferredProject.length > 0) {
        redirect(`/dashboard/${preferredProject[0].slug as string}`);
      }
    }

    const fallbackProject = await db`
      SELECT slug
      FROM projects
      WHERE user_id = ${user.id}
      ORDER BY
        CASE
          WHEN status = 'onboarding' THEN 0
          WHEN status = 'active' THEN 1
          ELSE 2
        END,
        created_at DESC
      LIMIT 1
    `;

    if (fallbackProject.length > 0) {
      redirect(`/dashboard/${fallbackProject[0].slug as string}`);
    }

    redirect("/dashboard");
  }

  // if (waitlistMode) {
  //   redirect("/waitlist");
  // }

  return <LandingHero />;
}
