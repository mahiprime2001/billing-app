import pool from '../../../lib/mysql';

interface SyncLog {
  change_type: 'create' | 'update' | 'delete';
  change_data: any;
}

export async function logSync(log: SyncLog) {
  const { change_type, change_data } = log;
  const query = `
    INSERT INTO sync_table (sync_time, change_type, change_data)
    VALUES (NOW(), ?, ?)
  `;
  const params = [change_type, JSON.stringify(change_data)];
  await pool.execute(query, params);
}
