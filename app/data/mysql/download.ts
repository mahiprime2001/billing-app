import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import pool from '../../../lib/mysql';

async function downloadData() {
  const connection = await pool.getConnection();
  const jsonDir = path.join(process.cwd(), 'app', 'data', 'json');

  try {
    console.log('Starting bill data download from MySQL...');

    // Fetch Bills and BillItems
    const [billsRows] = await connection.execute('SELECT * FROM Bills');
    const [billItemsRows] = await connection.execute('SELECT * FROM BillItems');
    const bills = (billsRows as any[]).map(bill => {
      const items = (billItemsRows as any[]).filter(item => item.billId === bill.id);
      return { ...bill, items };
    });
    await fs.writeFile(path.join(jsonDir, 'bills.json'), JSON.stringify(bills, null, 2));
    console.log('Bills data downloaded.');

    console.log('Bill data download completed successfully!');
  } catch (error) {
    console.error('Error downloading bill data:', error);
  } finally {
    connection.release();
    pool.end();
  }
}

downloadData();
