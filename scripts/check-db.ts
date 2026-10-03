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
        if (key && valueParts.length > 0) {
          const value = valueParts.join("=").trim();
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      });
    } catch {
      // Continue if an env file is missing.
    }
  }
}

async function checkDb() {
  loadEnv();
  
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  console.log("🔄 Connecting to database...");
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name;
      `);
      
      console.log("\n✅ Tables in database:");
      result.rows.forEach((row) => {
        const tableName = row.table_name as string;
        console.log(`  - ${tableName}`);
      });
      console.log("");
    } finally {
      client.release();
    }
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Check failed:", error);
    process.exit(1);
  }
}

checkDb();
