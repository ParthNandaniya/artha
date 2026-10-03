import type { SchemaOperation } from "./types";
import { getWebsiteDbForProject } from "@/lib/neon";

export interface SchemaTemplate {
  id: string;
  name: string;
  description: string;
  operations: SchemaOperation[];
}

export const SCHEMA_TEMPLATES: SchemaTemplate[] = [
  {
    id: "saas_subscriptions",
    name: "SaaS Subscriptions",
    description: "Subscription plans with recurring billing integration",
    operations: [
      {
        operation: "create_table",
        table: "subscription_plans",
        display_name: "Subscription Plans",
        description: "Available subscription plans for your customers",
        template_id: "saas_subscriptions",
        columns: [
          { name: "name", type: "TEXT", nullable: false },
          { name: "slug", type: "TEXT", nullable: false, unique: true },
          { name: "price_cents", type: "INTEGER", nullable: false },
          { name: "currency", type: "TEXT", default_value: "'usd'" },
          { name: "interval", type: "TEXT", default_value: "'month'" },
          { name: "features", type: "JSONB", default_value: "'[]'::jsonb" },
          { name: "active", type: "BOOLEAN", default_value: "TRUE" },
          { name: "sort_order", type: "INTEGER", default_value: "0" },
          { name: "stripe_price_id", type: "TEXT" },
        ],
        indexes: [{ name: "idx_sub_plans_slug", columns: ["slug"], unique: true }],
      },
      {
        operation: "create_table",
        table: "customer_subscriptions",
        display_name: "Customer Subscriptions",
        description: "Active customer subscriptions",
        template_id: "saas_subscriptions",
        columns: [
          { name: "customer_email", type: "TEXT", nullable: false },
          { name: "plan_slug", type: "TEXT", nullable: false },
          { name: "status", type: "TEXT", default_value: "'active'" },
          { name: "stripe_subscription_id", type: "TEXT" },
          { name: "current_period_start", type: "TIMESTAMPTZ" },
          { name: "current_period_end", type: "TIMESTAMPTZ" },
          { name: "cancelled_at", type: "TIMESTAMPTZ" },
        ],
        indexes: [{ name: "idx_cust_sub_email", columns: ["customer_email"] }],
      },
    ],
  },
  {
    id: "credits_system",
    name: "Credits System",
    description: "Credit-based usage system with balance tracking and transactions",
    operations: [
      {
        operation: "create_table",
        table: "credit_balances",
        display_name: "Credit Balances",
        description: "Customer credit balances",
        template_id: "credits_system",
        columns: [
          { name: "customer_email", type: "TEXT", nullable: false, unique: true },
          { name: "balance", type: "INTEGER", nullable: false, default_value: "0" },
          { name: "lifetime_earned", type: "INTEGER", default_value: "0" },
          { name: "lifetime_spent", type: "INTEGER", default_value: "0" },
          { name: "last_recharged_at", type: "TIMESTAMPTZ" },
        ],
        indexes: [{ name: "idx_credit_bal_email", columns: ["customer_email"], unique: true }],
      },
      {
        operation: "create_table",
        table: "credit_transactions",
        display_name: "Credit Transactions",
        description: "Credit transaction history",
        template_id: "credits_system",
        columns: [
          { name: "customer_email", type: "TEXT", nullable: false },
          { name: "amount", type: "INTEGER", nullable: false },
          { name: "type", type: "TEXT", nullable: false },
          { name: "description", type: "TEXT" },
          { name: "reference_id", type: "TEXT" },
        ],
        indexes: [{ name: "idx_credit_tx_email", columns: ["customer_email"] }],
      },
    ],
  },
  {
    id: "marketplace",
    name: "Marketplace",
    description: "Product listings, orders, and reviews for a marketplace",
    operations: [
      {
        operation: "create_table",
        table: "products",
        display_name: "Products",
        description: "Marketplace product listings",
        template_id: "marketplace",
        columns: [
          { name: "name", type: "TEXT", nullable: false },
          { name: "slug", type: "TEXT", nullable: false, unique: true },
          { name: "description", type: "TEXT" },
          { name: "price_cents", type: "INTEGER", nullable: false },
          { name: "currency", type: "TEXT", default_value: "'usd'" },
          { name: "category", type: "TEXT" },
          { name: "image_url", type: "TEXT" },
          { name: "stock", type: "INTEGER", default_value: "0" },
          { name: "active", type: "BOOLEAN", default_value: "TRUE" },
          { name: "metadata", type: "JSONB", default_value: "'{}'::jsonb" },
        ],
        indexes: [
          { name: "idx_products_slug", columns: ["slug"], unique: true },
          { name: "idx_products_category", columns: ["category"] },
        ],
      },
      {
        operation: "create_table",
        table: "orders",
        display_name: "Orders",
        description: "Customer orders",
        template_id: "marketplace",
        columns: [
          { name: "customer_email", type: "TEXT", nullable: false },
          { name: "status", type: "TEXT", default_value: "'pending'" },
          { name: "total_cents", type: "INTEGER", nullable: false },
          { name: "currency", type: "TEXT", default_value: "'usd'" },
          { name: "items", type: "JSONB", nullable: false },
          { name: "shipping_address", type: "JSONB" },
          { name: "stripe_payment_intent_id", type: "TEXT" },
          { name: "notes", type: "TEXT" },
        ],
        indexes: [{ name: "idx_orders_customer", columns: ["customer_email"] }],
      },
    ],
  },
  {
    id: "booking",
    name: "Booking System",
    description: "Appointment scheduling with time slots and bookings",
    operations: [
      {
        operation: "create_table",
        table: "services",
        display_name: "Services",
        description: "Available services for booking",
        template_id: "booking",
        columns: [
          { name: "name", type: "TEXT", nullable: false },
          { name: "description", type: "TEXT" },
          { name: "duration_minutes", type: "INTEGER", nullable: false },
          { name: "price_cents", type: "INTEGER", nullable: false },
          { name: "currency", type: "TEXT", default_value: "'usd'" },
          { name: "active", type: "BOOLEAN", default_value: "TRUE" },
        ],
      },
      {
        operation: "create_table",
        table: "bookings",
        display_name: "Bookings",
        description: "Customer bookings",
        template_id: "booking",
        columns: [
          { name: "customer_email", type: "TEXT", nullable: false },
          { name: "customer_name", type: "TEXT" },
          { name: "service_id", type: "UUID", references: { table: "services", column: "id" } },
          { name: "start_time", type: "TIMESTAMPTZ", nullable: false },
          { name: "end_time", type: "TIMESTAMPTZ", nullable: false },
          { name: "status", type: "TEXT", default_value: "'confirmed'" },
          { name: "notes", type: "TEXT" },
          { name: "stripe_payment_intent_id", type: "TEXT" },
        ],
        indexes: [
          { name: "idx_bookings_customer", columns: ["customer_email"] },
          { name: "idx_bookings_start", columns: ["start_time"] },
        ],
      },
    ],
  },
  {
    id: "ecommerce",
    name: "E-Commerce",
    description: "Full e-commerce with products, cart, and order management",
    operations: [
      {
        operation: "create_table",
        table: "store_products",
        display_name: "Store Products",
        description: "Products in your online store",
        template_id: "ecommerce",
        columns: [
          { name: "name", type: "TEXT", nullable: false },
          { name: "slug", type: "TEXT", nullable: false, unique: true },
          { name: "description", type: "TEXT" },
          { name: "price_cents", type: "INTEGER", nullable: false },
          { name: "compare_at_price_cents", type: "INTEGER" },
          { name: "currency", type: "TEXT", default_value: "'usd'" },
          { name: "sku", type: "TEXT" },
          { name: "stock", type: "INTEGER", default_value: "0" },
          { name: "images", type: "JSONB", default_value: "'[]'::jsonb" },
          { name: "category", type: "TEXT" },
          { name: "tags", type: "TEXT[]", default_value: "'{}'" },
          { name: "active", type: "BOOLEAN", default_value: "TRUE" },
          { name: "metadata", type: "JSONB", default_value: "'{}'::jsonb" },
        ],
        indexes: [
          { name: "idx_store_products_slug", columns: ["slug"], unique: true },
          { name: "idx_store_products_category", columns: ["category"] },
        ],
      },
      {
        operation: "create_table",
        table: "store_orders",
        display_name: "Store Orders",
        description: "Customer purchase orders",
        template_id: "ecommerce",
        columns: [
          { name: "customer_email", type: "TEXT", nullable: false },
          { name: "customer_name", type: "TEXT" },
          { name: "status", type: "TEXT", default_value: "'pending'" },
          { name: "subtotal_cents", type: "INTEGER", nullable: false },
          { name: "tax_cents", type: "INTEGER", default_value: "0" },
          { name: "shipping_cents", type: "INTEGER", default_value: "0" },
          { name: "total_cents", type: "INTEGER", nullable: false },
          { name: "currency", type: "TEXT", default_value: "'usd'" },
          { name: "line_items", type: "JSONB", nullable: false },
          { name: "shipping_address", type: "JSONB" },
          { name: "billing_address", type: "JSONB" },
          { name: "stripe_payment_intent_id", type: "TEXT" },
          { name: "tracking_number", type: "TEXT" },
          { name: "notes", type: "TEXT" },
        ],
        indexes: [
          { name: "idx_store_orders_customer", columns: ["customer_email"] },
          { name: "idx_store_orders_status", columns: ["status"] },
        ],
      },
    ],
  },
];

export function getTemplate(templateId: string): SchemaTemplate | undefined {
  return SCHEMA_TEMPLATES.find((t) => t.id === templateId);
}

export function getTemplatesSummary(): string {
  return SCHEMA_TEMPLATES.map(
    (t) => `- ${t.id}: ${t.name} — ${t.description} (${t.operations.length} tables)`
  ).join("\n");
}

// ── Credit recharge ──────────────────────────────────────────────────

/**
 * Recharge customer credits when their subscription renews.
 * Called from Stripe webhook on invoice.paid for marketplace subscriptions.
 */
export async function rechargeCreditBalance(
  projectId: string,
  customerEmail: string,
  creditsToAdd: number
): Promise<boolean> {
  const websiteDb = await getWebsiteDbForProject(projectId);
  if (!websiteDb) return false;

  try {
    const tableCheck = await websiteDb`
      SELECT 1 FROM _schema_registry WHERE table_name = 'credit_balances' LIMIT 1
    `;
    if (tableCheck.length === 0) return false;

    await websiteDb`
      INSERT INTO credit_balances (customer_email, balance, lifetime_earned, last_recharged_at)
      VALUES (${customerEmail}, ${creditsToAdd}, ${creditsToAdd}, NOW())
      ON CONFLICT (customer_email) DO UPDATE
      SET balance = credit_balances.balance + ${creditsToAdd},
          lifetime_earned = credit_balances.lifetime_earned + ${creditsToAdd},
          last_recharged_at = NOW(),
          updated_at = NOW()
    `;

    const txTableCheck = await websiteDb`
      SELECT 1 FROM _schema_registry WHERE table_name = 'credit_transactions' LIMIT 1
    `;
    if (txTableCheck.length > 0) {
      await websiteDb`
        INSERT INTO credit_transactions (customer_email, amount, type, description)
        VALUES (${customerEmail}, ${creditsToAdd}, 'recharge', 'Subscription renewal credit recharge')
      `;
    }

    return true;
  } catch {
    return false;
  }
}
