import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from "@shared/schema";
import { sql } from 'drizzle-orm';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('[Database] ❌ DATABASE_URL is not set!');
  console.error('[Database] Please add DATABASE_URL to your Secrets with a valid PostgreSQL connection string');
  console.error('[Database] Format: postgresql://username:password@host:port/database');
  throw new Error(
    "DATABASE_URL environment variable is not set. Please add it to your Secrets."
  );
}

console.log('[Database] Using connection string from environment');

// Use HTTP connections instead of WebSocket pool to avoid connection exhaustion
// HTTP connections are stateless and don't have pool limits
const sqlConn = neon(connectionString, {
  fetchOptions: {
    cache: 'no-store',
  },
});
export const db = drizzle(sqlConn, {
  schema,
  logger: false // Disable query logging to reduce overhead
});

export async function testConnection(retries = 3): Promise<boolean> {
  console.log(`[Database] Testing connection... (retries left: ${retries})`);
  try {
    // Simple connection test using raw SQL
    await db.execute(sql`SELECT 1`);
    console.log('[Database] ✅ Connection successful!');
    return true;
  } catch (error: any) {
    console.error('[Database] ❌ Connection failed:', error);

    // Log detailed error information
    if (error.cause) {
      console.error('[Database] Error cause:', error.cause);
    }

    if (retries > 0) {
      console.log('[Database] Retrying in 3 seconds...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      return testConnection(retries - 1);
    }

    // Provide more helpful error message
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Database] ⚠️ Please check:');
    console.error('[Database]   1. DATABASE_URL is set in Secrets');
    console.error('[Database]   2. Database server is running');
    console.error('[Database]   3. Network connectivity to database');

    throw new Error(`Database connection failed after retries: ${errorMsg}`);
  }
}

// Verify database connection on startup with retry logic
(async () => {
  try {
    await testConnection();
  } catch (error) {
    console.error('[Database] ❌ Initial connection test failed. Application might not function correctly.');
    // Optionally, you could exit the process here if a database connection is critical
    // process.exit(1);
  }
})();