import { NextRequest, NextResponse } from "next/server";
import { setupSystemCrons } from "@/lib/cron-jobs-setup";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.CRONJOB_ORG_API_KEY) {
    return NextResponse.json(
      { error: "CRONJOB_ORG_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://artha.run";

  try {
    const result = await setupSystemCrons(appUrl);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to setup system crons:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Setup failed" },
      { status: 500 }
    );
  }
}
