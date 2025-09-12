import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const pool = mysql.createPool({
  host: '86.38.243.155',
  user: 'u408450631_siri',
  password: 'Siriart@2025',
  database: 'u408450631_siri',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function getTables() {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query('SHOW TABLES');
    return rows.map(row => Object.values(row)[0]);
  } finally {
    connection.release();
  }
}

async function exportFormattedData() {
  const outputDir = path.join(process.cwd(), 'app', 'data', 'json');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const connection = await pool.getConnection();
  try {
    const tables = await getTables();

    // Export Bills
    const [bills] = await connection.query('SELECT * FROM Bills');
    const [billItems] = await connection.query('SELECT * FROM BillItems');
    const formattedBills = bills.map(bill => ({
      ...bill,
      items: billItems.filter(item => item.billId === bill.id)
    }));
    fs.writeFileSync(path.join(outputDir, 'bills.json'), JSON.stringify(formattedBills, null, 2));
    console.log('Successfully exported formatted data to bills.json');

    // Export Products
    const [products] = await connection.query('SELECT * FROM Products');
    fs.writeFileSync(path.join(outputDir, 'products.json'), JSON.stringify(products, null, 2));
    console.log('Successfully exported data to products.json');

    // Export Stores
    const [stores] = await connection.query('SELECT * FROM Stores');
    fs.writeFileSync(path.join(outputDir, 'stores.json'), JSON.stringify(stores, null, 2));
    console.log('Successfully exported data to stores.json');

    // Export Users
    const [users] = await connection.query('SELECT * FROM Users');
    fs.writeFileSync(path.join(outputDir, 'users.json'), JSON.stringify(users, null, 2));
    console.log('Successfully exported data to users.json');

    // Export Settings
    const [settings] = await connection.query('SELECT * FROM SystemSettings');
    fs.writeFileSync(path.join(outputDir, 'settings.json'), JSON.stringify(settings, null, 2));
    console.log('Successfully exported data to settings.json');

    // Export Notifications
    if (tables.includes('notifications')) {
        const [notifications] = await connection.query('SELECT * FROM notifications');
        fs.writeFileSync(path.join(outputDir, 'notifications.json'), JSON.stringify(notifications, null, 2));
        console.log('Successfully exported data to notifications.json');
    }

  } finally {
    connection.release();
    pool.end();
  }
}

exportFormattedData().catch(err => {
  console.error('Error exporting formatted data:', err);
  pool.end();
});
