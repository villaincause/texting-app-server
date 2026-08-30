import oracledb from 'oracledb';
import dotenv from 'dotenv';

dotenv.config();

// Enable auto-commit for transactions if needed, or manage explicitly
oracledb.autoCommit = true;

// Optional: Force JSON output formatting for database queries
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

let pool;

export async function initializeDatabase() {
  try {
    pool = await oracledb.createPool({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectString: process.env.DB_CONNECT_STRING,
      poolMin: 2,
      poolMax: 10,
      poolIncrement: 1,
      poolTimeout: 60,
    });
    console.log('Oracle Database connection pool initialized successfully.');
  } catch (err) {
    console.error('Failed to initialize Oracle DB pool:', err);
    process.exit(1);
  }
}

export async function getConnection() {
  if (!pool) {
    throw new Error('Database pool has not been initialized.');
  }
  return await pool.getConnection();
}

export async function closeDatabase() {
  try {
    if (pool) {
      await pool.close(10); // Wait up to 10 seconds for connections to drain
      console.log('Oracle Database connection pool closed.');
    }
  } catch (err) {
    console.error('Error closing Oracle DB pool:', err);
  }
}