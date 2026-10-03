import { NextResponse } from "next/server";
import { unsubscribeUser, resubscribeUser, isValidEmailType, type EmailType } from "@/lib/email-unsubscribe";

export async function POST(request: Request) {
  try {
    const { token, type, action = "unsubscribe" } = await request.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const emailType = (type || "all") as string;
    if (!isValidEmailType(emailType)) {
      return NextResponse.json({ error: "Invalid email type" }, { status: 400 });
    }

    if (action === "resubscribe") {
      const ok = await resubscribeUser(token, emailType as EmailType);
      if (!ok) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
      return NextResponse.json({ success: true, message: "You have been resubscribed." });
    }

    const ok = await unsubscribeUser(token, emailType as EmailType);
    if (!ok) return NextResponse.json({ error: "Invalid token" }, { status: 404 });

    return NextResponse.json({ success: true, message: "You have been unsubscribed." });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
