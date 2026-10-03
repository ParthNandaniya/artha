import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";

/**
 * Postmark webhook handler for tracking email delivery, opens, clicks, and bounces.
 * Configure in Postmark: Settings → Webhooks → Add webhook → point to this URL.
 * Events: Delivery, Open, Click, Bounce
 */
export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (process.env.POSTMARK_WEBHOOK_SECRET && secret !== process.env.POSTMARK_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const recordType = payload.RecordType as string | undefined;
  const messageId = payload.MessageID as string | undefined;

  if (!recordType || !messageId) {
    return NextResponse.json({ ok: true, skipped: "no record type or message ID" });
  }

  const db = getDb();

  try {
    switch (recordType) {
      case "Delivery": {
        await db`
          UPDATE email_messages
          SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'delivered_at', ${new Date().toISOString()}
          )
          WHERE (message_id = ${messageId} OR metadata->>'postmark_message_id' = ${messageId})
        `;
        break;
      }

      case "Open": {
        const firstOpen = payload.FirstOpen as boolean | undefined;
        if (firstOpen) {
          await db`
            UPDATE email_messages
            SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'opened_at', ${new Date().toISOString()},
              'open_count', COALESCE((metadata->>'open_count')::int, 0) + 1
            )
            WHERE (message_id = ${messageId} OR metadata->>'postmark_message_id' = ${messageId})
          `;
        } else {
          await db`
            UPDATE email_messages
            SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'open_count', COALESCE((metadata->>'open_count')::int, 0) + 1
            )
            WHERE (message_id = ${messageId} OR metadata->>'postmark_message_id' = ${messageId})
          `;
        }
        break;
      }

      case "Click": {
        await db`
          UPDATE email_messages
          SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'clicked_at', ${new Date().toISOString()},
            'click_count', COALESCE((metadata->>'click_count')::int, 0) + 1
          )
          WHERE (message_id = ${messageId} OR metadata->>'postmark_message_id' = ${messageId})
        `;
        break;
      }

      case "Bounce": {
        const bounceType = payload.Type as string | undefined;
        await db`
          UPDATE email_messages
          SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'bounced_at', ${new Date().toISOString()},
            'bounce_type', ${bounceType || "unknown"}
          )
          WHERE (message_id = ${messageId} OR metadata->>'postmark_message_id' = ${messageId})
        `;
        break;
      }
    }
  } catch (err) {
    console.error(`[postmark-webhook] Error processing ${recordType}:`, err);
  }

  return NextResponse.json({ ok: true, recordType });
}
