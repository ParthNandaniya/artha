import Stripe from "stripe";

/**
 * Stripe environment selection:
 * - Production (deployed): Always uses STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (prod keys)
 * - Development (local): Uses STRIPE_USE_TEST_KEYS to switch:
 *   - STRIPE_USE_TEST_KEYS=true → test keys (STRIPE_SECRET_KEY_TEST, STRIPE_WEBHOOK_SECRET_TEST)
 *   - STRIPE_USE_TEST_KEYS=false or unset → prod keys (for testing prod flow locally)
 */
type StripeConfig = {
  secretKey: string;
  webhookSecret: string;
};

let stripeClient: Stripe | null = null;

function getStripeEnvNames() {
  const isProduction = process.env.NODE_ENV === "production";
  const useTestKeys = process.env.STRIPE_USE_TEST_KEYS === "true";

  if (isProduction) {
    return {
      secretKeyName: "STRIPE_SECRET_KEY",
      webhookSecretName: "STRIPE_WEBHOOK_SECRET",
    };
  }

  if (useTestKeys) {
    return {
      secretKeyName: process.env.STRIPE_SECRET_KEY_TEST ? "STRIPE_SECRET_KEY_TEST" : "STRIPE_SECRET_KEY",
      webhookSecretName: process.env.STRIPE_WEBHOOK_SECRET_TEST
        ? "STRIPE_WEBHOOK_SECRET_TEST"
        : "STRIPE_WEBHOOK_SECRET",
    };
  }

  return {
    secretKeyName: "STRIPE_SECRET_KEY",
    webhookSecretName: "STRIPE_WEBHOOK_SECRET",
  };
}

function requireStripeEnv(name: string, value?: string): string {
  if (!value) {
    throw new Error(`Missing required Stripe environment variable: ${name}`);
  }

  return value;
}

function getStripeConfig(): StripeConfig {
  const { secretKeyName, webhookSecretName } = getStripeEnvNames();

  const secretKey = process.env[secretKeyName];
  const webhookSecret = process.env[webhookSecretName];

  return {
    secretKey: requireStripeEnv(secretKeyName, secretKey),
    webhookSecret: requireStripeEnv(webhookSecretName, webhookSecret),
  };
}

export function getStripe() {
  if (!stripeClient) {
    stripeClient = new Stripe(getStripeConfig().secretKey, {
      apiVersion: "2026-02-25.clover",
    });
  }

  return stripeClient;
}

export function getStripeWebhookSecret() {
  return getStripeConfig().webhookSecret;
}

export const PLANS = {
  pro: {
    name: "Pro",
    price: 4900,
    taskCredits: 50,
    firstMonthBonus: 5,
  },
} as const;

export type PlanKey = keyof typeof PLANS;

export const CREDIT_PACK = {
  name: "Credit Pack",
  price: 2500,
  credits: 15,
} as const;
