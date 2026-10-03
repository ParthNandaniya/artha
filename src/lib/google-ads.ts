"use client";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

const SIGNUP_SEND_TO = process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_SEND_TO;
const SUBSCRIPTION_SEND_TO = process.env.NEXT_PUBLIC_GOOGLE_ADS_SUBSCRIPTION_SEND_TO;

const PLAN_VALUE_USD: Record<string, number> = {
  pro: 49,
  starter: 19,
};

function fireConversion(params: { send_to: string } & Record<string, unknown>): Promise<void> {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    window.gtag!("event", "conversion", {
      ...params,
      event_callback: finish,
      event_timeout: 2000,
    });
    setTimeout(finish, 2000);
  });
}

export async function fireSignupConversion(projectSlug: string): Promise<void> {
  if (!SIGNUP_SEND_TO || typeof window === "undefined") return;
  const key = `ads_signup_fired_${projectSlug}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  await fireConversion({ send_to: SIGNUP_SEND_TO, transaction_id: projectSlug });
}

export async function fireSubscriptionConversion(args: {
  projectId: string;
  plan?: string;
  stripeSessionId?: string;
}): Promise<void> {
  if (!SUBSCRIPTION_SEND_TO || typeof window === "undefined") return;
  const dedupeId = args.stripeSessionId || args.projectId;
  const key = `ads_subscription_fired_${dedupeId}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  const value = PLAN_VALUE_USD[args.plan || "pro"] ?? PLAN_VALUE_USD.pro;
  await fireConversion({
    send_to: SUBSCRIPTION_SEND_TO,
    transaction_id: dedupeId,
    value,
    currency: "USD",
  });
}
