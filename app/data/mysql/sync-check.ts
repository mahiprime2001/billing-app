import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import pool from '../../../lib/mysql';

const LOG_DIR = path.join(process.cwd(), 'app', 'data', 'logs');
const JSON_DIR = path.join(process.cwd(), 'app', 'data', 'json');
const SYNC_STATE_FILE = path.join(LOG_DIR, 'sync_state.json');
const NOTIFICATIONS_FILE = path.join(JSON_DIR, 'notifications.json');
const POLLING_INTERVAL = 15 * 60 * 1000; // 15 minutes
const LOG_RETENTION_DAYS = 30;

interface SyncRecord {
  id: number;
  sync_time: string;
  change_type: 'create' | 'update' | 'delete' | 'password_reset' | 'USER_LOGIN' | 'BILL_CREATED';
  change_data: any;
}

interface SyncState {
  lastSyncId: number;
}

interface Notification {
  id: string;
  type: 'PASSWORD_RESET';
  title: string;
  message: string;
  userId: string;
  userName: string;
  userEmail: string;
  isRead: boolean;
  createdAt: string;
  syncLogId: number;
}

// Retry wrapper for queries
async function executeWithRetry(query: string, params: any[] = [], retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.execute(query, params);
      return rows;
    } catch (err: any) {
      if (attempt === retries) throw err;
      console.warn(`[MySQL] Query failed (attempt ${attempt}) - retrying...`, err.code);
      await new Promise(res => setTimeout(res, 2000)); // wait before retry
    } finally {
      if (connection) connection.release();
    }
  }
}

async function loadSyncState(): Promise<SyncState> {
  try {
    const data = await fs.readFile(SYNC_STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { lastSyncId: 0 };
  }
}

async function saveSyncState(state: SyncState) {
  await fs.writeFile(SYNC_STATE_FILE, JSON.stringify(state, null, 2));
}

async function loadNotifications(): Promise<Notification[]> {
  try {
    const data = await fs.readFile(NOTIFICATIONS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveNotifications(notifications: Notification[]) {
  await fs.writeFile(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));
}

async function createPasswordResetNotification(change: SyncRecord) {
  try {
    const parsed_change_data = typeof change.change_data === 'string' 
      ? JSON.parse(change.change_data) 
      : change.change_data;

    // Extract user info from change_data
    const { id: userId, name: userName, email: userEmail } = parsed_change_data;
    
    if (!userId || !userName) {
      console.error('Missing user data in password reset change:', parsed_change_data);
      return;
    }

    // Load existing notifications
    const notifications = await loadNotifications();

    // Check if notification for this sync log already exists
    const existingNotification = notifications.find(n => n.syncLogId === change.id);
    if (existingNotification) {
      console.log(`Notification already exists for sync log ID ${change.id}`);
      return;
    }

    // Create new notification
    const notification: Notification = {
      id: `notif_${Date.now()}_${userId}`,
      type: 'PASSWORD_RESET',
      title: 'Password Changed',
      message: `The user ${userName} has changed the password`,
      userId,
      userName,
      userEmail: userEmail || '',
      isRead: false,
      createdAt: change.sync_time,
      syncLogId: change.id
    };

    // Add to notifications array
    notifications.unshift(notification); // Add to beginning for newest first

    // Keep only last 100 notifications to prevent file from getting too large
    const trimmedNotifications = notifications.slice(0, 100);

    // Save updated notifications
    await saveNotifications(trimmedNotifications);

    console.log(`✅ Created notification: ${notification.message}`);
    
  } catch (error) {
    console.error('Error creating password reset notification:', error);
  }
}

async function cleanupOldLogs() {
  const now = Date.now();
  const retentionPeriod = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  try {
    const files = await fs.readdir(LOG_DIR);
    for (const file of files) {
      if (file.endsWith('.log')) {
        const filePath = path.join(LOG_DIR, file);
        const stats = await fs.stat(filePath);
        if (now - stats.mtime.getTime() > retentionPeriod) {
          await fs.unlink(filePath);
          console.log(`Deleted old log file: ${file}`);
        }
      }
    }
  } catch (error) {
    console.error('Error cleaning up old logs:', error);
  }
}

async function processChanges(changes: SyncRecord[]) {
  for (const change of changes) {
    const { change_type, change_data } = change;
    
    // Process password reset notifications
    if (change_type === 'password_reset') {
      await createPasswordResetNotification(change);
    }

    const parsed_change_data = typeof change_data === 'string' ? JSON.parse(change_data) : change_data;
    const { table, id } = parsed_change_data;

    if (!table || !id) {
      console.error('Invalid change data:', parsed_change_data);
      continue;
    }

    const jsonPath = path.join(JSON_DIR, `${table}.json`);

    try {
      const jsonData = await fs.readFile(jsonPath, 'utf-8');
      let records = JSON.parse(jsonData);
      let recordsChanged = false;

      const recordIndex = records.findIndex((record: any) => record.id === id);
      const recordExists = recordIndex > -1;

      if (change_type === 'delete') {
        if (recordExists) {
          records = records.filter((record: any) => record.id !== id);
          recordsChanged = true;
          console.log(`Record ${id} from table ${table} will be deleted.`);
        } else {
          console.log(`Record ${id} from table ${table} already deleted. Skipping.`);
        }
      } else if (change_type !== 'password_reset') { // create or update (skip password_reset as it's handled above)
        const rows = await executeWithRetry(`SELECT * FROM ${table} WHERE id = ?`, [id]);
        const updatedRecord = (rows as any[])[0];

        if (updatedRecord) {
          if (recordExists) {
            // Update: Check if data is different before updating
            if (JSON.stringify(records[recordIndex]) !== JSON.stringify(updatedRecord)) {
              records[recordIndex] = updatedRecord;
              recordsChanged = true;
              console.log(`Record ${id} in table ${table} will be updated.`);
            } else {
              console.log(`Record ${id} in table ${table} is already up-to-date. Skipping.`);
            }
          } else {
            // Create
            records.push(updatedRecord);
            recordsChanged = true;
            console.log(`Record ${id} will be added to table ${table}.`);
          }
        }
      }

      if (recordsChanged) {
        await fs.writeFile(jsonPath, JSON.stringify(records, null, 2));
        console.log(`Updated ${table}.json for ID: ${id}`);
      }
    } catch (error) {
      console.error(`Error processing change for ${table}.json:`, error);
    }
  }
}

async function checkForChanges() {
  console.log('Checking for changes...');
  try {
    const state = await loadSyncState();
    const rows = await executeWithRetry(
      'SELECT * FROM sync_table WHERE id > ? ORDER BY id ASC',
      [state.lastSyncId]
    );

    const changes = rows as SyncRecord[];
    if (changes.length > 0) {
      console.log(`Found ${changes.length} new changes.`);
      
      // Check for password reset changes
      const passwordResetChanges = changes.filter(c => c.change_type === 'password_reset');
      if (passwordResetChanges.length > 0) {
        console.log(`Found ${passwordResetChanges.length} password reset changes - creating notifications.`);
      }

      await processChanges(changes);
      const newState = { lastSyncId: changes[changes.length - 1].id };
      await saveSyncState(newState);
    } else {
      console.log('No new changes found.');
    }
  } catch (error) {
    console.error('Error checking for changes:', error);
  }
}

// Keep-alive ping to prevent MySQL idle disconnects
setInterval(async () => {
  try {
    await executeWithRetry('SELECT 1');
    console.log(`[MySQL] Keep-alive ping successful at ${new Date().toISOString()}`);
  } catch (err) {
    console.error('[MySQL] Keep-alive ping failed:', err);
  }
}, 5 * 60 * 1000); // every 5 minutes

async function startSyncProcess() {
  console.log('Starting sync process with notification support...');
  
  // Ensure notifications file exists
  try {
    await fs.access(NOTIFICATIONS_FILE);
  } catch {
    await saveNotifications([]);
    console.log('Created notifications.json file');
  }
  
  async function runChecks() {
    await checkForChanges();
    await cleanupOldLogs();
    setTimeout(runChecks, POLLING_INTERVAL);
  }

  runChecks();
}

startSyncProcess();
