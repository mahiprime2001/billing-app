import 'dotenv/config';
import pool from '../lib/mysql';

async function clearDatabase() {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Disable foreign key checks to avoid errors
    await connection.execute('SET FOREIGN_KEY_CHECKS=0;');

    // List of tables to clear
    const tables = [
      'Bills',
      'BillItems',
      'Products',
      'ProductBarcodes',
      'Users',
      'UserStores',
      'Stores',
      'sync_table'
    ];

    // Clear each table
    for (const table of tables) {
      console.log(`Clearing table: ${table}`);
      await connection.execute(`DELETE FROM ${table};`);
      await connection.execute(`ALTER TABLE ${table} AUTO_INCREMENT = 1;`);
    }

    // Re-enable foreign key checks
    await connection.execute('SET FOREIGN_KEY_CHECKS=1;');

    await connection.commit();
    console.log('All tables cleared successfully.');
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error clearing database:', error);
  } finally {
    if (connection) {
      connection.release();
    }
    pool.end();
  }
}

clearDatabase();
