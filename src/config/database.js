import oracledb from "oracledb";
import { config } from "./env.js";

console.log("Database configuration:", {
  user: config.DB_USER,
  connectString: config.DB_CONNECT_STRING,
  // Do not log the password for security reasons
});

// Enable auto-commit for transactions if needed, or manage explicitly
oracledb.autoCommit = true;

// Optional: Force JSON output formatting for database queries
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

let pool;

export async function initializeDatabase() {
  try {
    pool = await oracledb.createPool({
      user: config.DB_USER,
      password: config.DB_PASSWORD,
      connectString: config.DB_CONNECT_STRING,
      poolMin: 2,
      poolMax: 10,
      poolIncrement: 1,
      poolTimeout: 60,
    });
    console.log("Oracle Database connection pool initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize Oracle DB pool:", err);
    process.exit(1);
  }
}

export async function getConnection() {
  if (!pool) {
    throw new Error("Database pool has not been initialized.");
  }
  return await pool.getConnection();
}

export async function closeDatabase() {
  try {
    if (pool) {
      await pool.close(10); // Wait up to 10 seconds for connections to drain
      console.log("Oracle Database connection pool closed.");
    }
  } catch (err) {
    console.error("Error closing Oracle DB pool:", err);
  }
}
