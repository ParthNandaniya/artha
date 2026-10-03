import { getDb } from "./neon";

export type EmailType = "all" | "digest" | "nudge" | "marketing" | "weekly_summary";

const VALID_EMAIL_TYPES: EmailType[] = ["all", "digest", "nudge", "marketing", "weekly_summary"];

export function isValidEmailType(type: string): type is EmailType {
  return VALID_EMAIL_TYPES.includes(type as EmailType);
}

export async function getOrCreateUnsubscribeToken(userId: string): Promise<string> {
  const db = getDb();
  const [row] = await db`SELECT unsubscribe_token FROM users WHERE id = ${userId}`;
  if (row?.unsubscribe_token) return row.unsubscribe_token as string;

  const token = crypto.randomUUID();
  await db`UPDATE users SET unsubscribe_token = ${token} WHERE id = ${userId}`;
  return token;
}

export function getUnsubscribeUrl(token: string, emailType: EmailType = "all"): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://artha.run").replace(/\/+$/, "");
  return `${appUrl}/unsubscribe?token=${token}&type=${emailType}`;
}

export async function unsubscribeUser(token: string, emailType: EmailType): Promise<boolean> {
  const db = getDb();
  const users = await db`SELECT id FROM users WHERE unsubscribe_token = ${token}`;
  if (users.length === 0) return false;

  const userId = users[0].id as string;
  await db`
    INSERT INTO email_unsubscribes (user_id, email_type)
    VALUES (${userId}, ${emailType})
    ON CONFLICT (user_id, email_type) DO NOTHING
  `;
  return true;
}

export async function resubscribeUser(token: string, emailType: EmailType): Promise<boolean> {
  const db = getDb();
  const users = await db`SELECT id FROM users WHERE unsubscribe_token = ${token}`;
  if (users.length === 0) return false;

  const userId = users[0].id as string;
  await db`DELETE FROM email_unsubscribes WHERE user_id = ${userId} AND email_type = ${emailType}`;
  return true;
}

export async function isUserUnsubscribed(userId: string, emailType: EmailType): Promise<boolean> {
  const db = getDb();
  const rows = await db`
    SELECT 1 FROM email_unsubscribes
    WHERE user_id = ${userId} AND email_type IN (${emailType}, 'all')
    LIMIT 1
  `;
  return rows.length > 0;
}
