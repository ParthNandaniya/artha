import { PostHog } from "posthog-node";

let client: PostHog | undefined;

export function getPostHogServerClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || process.env.NODE_ENV !== "production") return null;

  if (!client) {
    client = new PostHog(key, {
      host: "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }

  return client;
}

/** Capture a server-side event (e.g. from API routes or cron jobs) */
export function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  const ph = getPostHogServerClient();
  if (!ph) return;
  ph.capture({ distinctId, event, properties });
}
