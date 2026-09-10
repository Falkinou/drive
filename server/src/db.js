import pg from "pg";

const { Pool, types } = pg;

// DRIVE uses small bigint identifiers; returning numbers preserves compatibility
// with the legacy JSON API responses.
types.setTypeParser(20, value => Number(value));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

export const pool = new Pool({
  connectionString,
  application_name: "drive-api",
  max: Number(process.env.DB_POOL_SIZE || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", error => {
  console.error("Unexpected PostgreSQL pool error", error);
});

export async function waitForDatabase(attempts = 30) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query("select 1");
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 1_000));
    }
  }
  throw lastError;
}

export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
