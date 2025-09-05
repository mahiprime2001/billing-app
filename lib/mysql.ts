import mysql from 'mysql2/promise';

// Create the connection pool. The pool-specific settings are the defaults
const pool = mysql.createPool({
  host: '86.38.243.155',
  user: 'u408450631_siri',
  password: 'Siriart@2025',
  database: 'u408450631_siri',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export async function connectToDatabase() {
  return await pool.getConnection();
}

export default pool;
