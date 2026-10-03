import { Pool, neonConfig } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { join } from "path";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

function loadEnv() {
  const envFiles = [".env.local", ".env"];

  for (const envFile of envFiles) {
    try {
      const envPath = join(process.cwd(), envFile);
      const envContent = readFileSync(envPath, "utf-8");

      envContent.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;

        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0 && !process.env[key]) {
          process.env[key] = valueParts.join("=").trim();
        }
      });
    } catch {
      // Continue if an env file is missing.
    }
  }
}

async function setupDb() {
  loadEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  const schemaPath = join(process.cwd(), "schema", "platform.sql");
  const schemaSql = readFileSync(schemaPath, "utf-8");

  console.log("🔄 Applying platform schema...");
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const client = await pool.connect();
    try {
      await client.query(schemaSql);
      console.log("✅ Platform schema is ready");
    } finally {
      client.release();
    }

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Database setup failed:", error);
    process.exit(1);
  }
}

setupDb();
