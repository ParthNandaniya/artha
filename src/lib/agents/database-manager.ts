import type { AgentInput, AgentOutput } from "./types";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { validateOutput } from "./framework/validation";
import { getAgenticConfigForSource } from "@/config/agent-agentic-config";
import { getWebsiteDbForProject } from "@/lib/neon";
import { executeSchemaOperations } from "@/lib/database/executor";
import { getTemplatesSummary } from "@/lib/database/templates";
import type { SchemaOperation } from "@/lib/database/types";

export async function runDatabaseManagerAgent(input: AgentInput): Promise<AgentOutput> {
  try {
    const progress = input.onProgress || (() => {});
    const source = (input.metadata?.executionSource as "pipeline" | "chat") || "chat";
    const config = getAgenticConfigForSource("database_manager", source);
    // Check if website DB exists (requires subscription)
    progress("Connecting to website database...");
    let websiteDb;
    try {
      websiteDb = await getWebsiteDbForProject(input.projectId);
    } catch (connError) {
      const msg = connError instanceof Error ? connError.message : String(connError);
      return {
        success: false,
        agent: "database_manager",
        summary: "Could not connect to the website database. The database may need to be re-provisioned.",
        error: `connection_failed: ${msg}`,
      };
    }

    if (!websiteDb) {
      return {
        success: false,
        agent: "database_manager",
        summary: "No website database found. A subscription is required to create custom database tables.",
        error: "no_website_db",
      };
    }

    // Verify the connection actually works before proceeding
    let existingTables = "";
    try {
      const registry = await websiteDb`SELECT table_name, display_name, description, columns FROM _schema_registry`;
      if (registry.length > 0) {
        existingTables = "\n\nExisting custom tables:\n" + registry
          .map((r) => `- ${r.display_name} (${r.table_name}): ${r.description || "No description"} — columns: ${JSON.stringify(r.columns)}`)
          .join("\n");
      }
    } catch (dbError) {
      const msg = dbError instanceof Error ? dbError.message : String(dbError);
      // If this is a connection/auth error (not just missing table), bail out
      if (msg.includes("password authentication failed") || msg.includes("connection") || msg.includes("ECONNREFUSED")) {
        return {
          success: false,
          agent: "database_manager",
          summary: "Could not connect to the website database. The database credentials may be expired or the database was hibernated.",
          error: `connection_failed: ${msg}`,
        };
      }
      // _schema_registry may not exist yet — that's fine
    }

    // Generate schema operations via AI
    progress("Planning database schema...");
    const result = await generateAgentJSON<{
      operations: SchemaOperation[];
      summary: string;
    }>(
      "database_manager",
      `You are a database schema architect for a business website. You create, modify, or drop PostgreSQL tables based on the user's business needs.

Available templates (use as inspiration, adapt to specific needs):
${getTemplatesSummary()}

System tables (cannot be modified): site_config, site_users, site_payments, _schema_registry
Free tables (in platform DB, always available): contacts, forms, form_submissions
${existingTables}

Rules:
- Table names: lowercase, underscores, start with a letter (e.g. subscription_plans, credit_balances)
- Allowed column types: TEXT, INTEGER, BIGINT, NUMERIC, BOOLEAN, TIMESTAMPTZ, UUID, JSONB, TEXT[]
- Every table auto-gets: id (UUID PK), created_at, updated_at — do NOT include these in columns
- Use seed_data to populate initial rows (e.g. subscription plan tiers)
- If creating subscription plans with prices, include stripe_price_id column (will be synced)
- Use meaningful display_name and description for each table
- For a pricing/subscription table with seed data, set template_id to "saas_subscriptions"

Return JSON:
{
  "operations": [
    {
      "operation": "create_table",
      "table": "table_name",
      "display_name": "Table Name",
      "description": "What this table stores",
      "template_id": "saas_subscriptions" | null,
      "columns": [{ "name": "col", "type": "TEXT", "nullable": false, "unique": false, "default_value": "'default'" }],
      "indexes": [{ "name": "idx_name", "columns": ["col"], "unique": false }],
      "seed_data": [{ "col": "value" }]
    }
  ],
  "summary": "Created X tables: ..."
}

Company context:
${input.context}`,
      input.prompt
    );

    if (!result.operations?.length) {
      return {
        success: true,
        agent: "database_manager",
        summary: result.summary || "No database changes needed.",
      };
    }

    // Execute the schema operations
    progress("Executing schema changes...");
    const { success, errors } = await executeSchemaOperations(websiteDb, result.operations);

    if (!success) {
      return {
        success: false,
        agent: "database_manager",
        summary: `Some operations failed: ${errors.join("; ")}`,
        schemaOperations: result.operations,
        error: errors.join("; "),
      };
    }

    const dbOutput: AgentOutput = {
      success: true,
      agent: "database_manager",
      summary: result.summary || `Successfully executed ${result.operations.length} database operations.`,
      schemaOperations: result.operations,
      links: [{ label: "View Database", url: "#landing-page" }],
    };

    // Structural validation
    const validation = await validateOutput(dbOutput, config, input.prompt);
    if (!validation.passed) {
      dbOutput.summary += ` (validation warnings: ${validation.structuralErrors?.join(", ")})`;
    }

    // Write schema operations to scratchpad
    if (input.scratchpad) {
      input.scratchpad.write(
        "database_manager.operations",
        result.operations.map((op) => `${op.operation}: ${op.table}`),
      );
    }

    return dbOutput;
  } catch (error) {
    return {
      success: false,
      agent: "database_manager",
      summary: `Database operation failed: ${error instanceof Error ? error.message : String(error)}`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
