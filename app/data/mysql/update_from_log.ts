import 'dotenv/config';
import pool from '../../../lib/mysql';
import { logSync } from './sync';
import { RowDataPacket, OkPacket } from 'mysql2';
import fs from 'fs/promises';
import path from 'path';
import dns from 'dns';

const logsDir = path.join(process.cwd(), 'app', 'data', 'logs');
const stateFilePath = path.join(logsDir, 'processing_state.json');
let isConnected = false;
let isProcessing = false;

function checkConnection() {
  dns.lookup('google.com', (err: NodeJS.ErrnoException | null) => {
    if (err && err.code === 'ENOTFOUND') {
      if (isConnected) {
        console.log('Internet connection lost. Waiting for connection...');
        isConnected = false;
      }
    } else {
      if (!isConnected) {
        console.log('Internet connection established.');
        isConnected = true;
        processLogs();
      }
    }
  });
}

async function loadProcessingState(): Promise<{ [key: string]: number }> {
  try {
    const data = await fs.readFile(stateFilePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.log('Processing state file not found or invalid. Starting from beginning.');
    return {};
  }
}

async function saveProcessingState(state: { [key: string]: number }) {
  await fs.writeFile(stateFilePath, JSON.stringify(state, null, 2));
}

function getTableName(entityType: string): string {
  const singular = entityType.endsWith('s') ? entityType.slice(0, -1) : entityType;
  const pascal = singular.charAt(0).toUpperCase() + singular.slice(1);
  if (entityType === 'bill') {
    return 'Bills';
  }
  return `${pascal}s`;
}

async function getRecordById(entityType: string, id: string): Promise<any> {
  const jsonPath = path.join(process.cwd(), 'app', 'data', 'json', `${entityType}.json`);
  try {
    const jsonData = await fs.readFile(jsonPath, 'utf-8');
    const records = JSON.parse(jsonData);
    return records.find((record: any) => record.id === id);
  } catch (error) {
    console.error(`Error reading or parsing ${jsonPath}:`, error);
    return null;
  }
}

async function processLogs() {
  if (isProcessing || !isConnected) return;
  isProcessing = true;

  const processingState = await loadProcessingState();

  try {
    const logFiles = (await fs.readdir(logsDir)).filter((file: string) => file.endsWith('.log') && !['sync.log', 'processing_state.json'].includes(file));

    for (const logFile of logFiles) {
      const entityType = logFile.replace('.json.log', '');
      const tableName = getTableName(entityType);
      const logFilePath = path.join(logsDir, logFile);
      const logData = await fs.readFile(logFilePath, 'utf-8');
      const logLines = logData.split('\n').filter((line: string) => line.trim() !== '');

      const lastProcessedLine = processingState[logFile] || 0;
      const linesToProcess = logLines.slice(lastProcessedLine);

      if (linesToProcess.length === 0) {
        continue;
      }

      console.log(`Processing ${linesToProcess.length} new log(s) from ${logFile}.`);

      let processedInFile = 0;
      for (let i = 0; i < linesToProcess.length; i++) {
        const line = linesToProcess[i];
        const currentLineNumber = lastProcessedLine + i + 1;
        
        if (!line.includes('(ID:') && !line.includes('product')) {
          continue;
        }
        const idMatch = line.match(/product ([0-9]+):/) || line.match(/Bill deleted: \(ID: ([^)]+)\)/) || line.match(/\(ID: ([^)]+)\)/);
        if (!idMatch) {
          console.log(`Could not parse ID from line ${currentLineNumber} in ${logFile}. Skipping.`);
          continue;
        }
        const id = idMatch[1];

        let retries = 3;
        while (retries > 0) {
          let connection;
          try {
            connection = await pool.getConnection();
            await connection.beginTransaction();

            const record = await getRecordById(entityType, id);

            if (line.includes('Bill deleted')) {
              await (connection as any).execute(`DELETE FROM Bills WHERE id = ?`, [id]);
              await logSync({ change_type: 'delete', change_data: { id, table: 'Bills' } });
            } else if (line.includes('deleted')) {
              await (connection as any).execute(`DELETE FROM ${tableName} WHERE id = ?`, [id]);
              await logSync({ change_type: 'delete', change_data: { id, table: tableName } });
            } else if (record) {
              if (entityType === 'products') {
                const { barcodes, category, description, ...productData } = record;
                
                // Update product details
                const productColumns = Object.keys(productData);
                const productValues = Object.values(productData);
                const productPlaceholders = productColumns.map(() => '?').join(', ');
                const productUpdatePlaceholders = productColumns.map(col => `${col} = ?`).join(', ');
                const productQuery = `INSERT INTO Products (${productColumns.join(', ')}) VALUES (${productPlaceholders}) ON DUPLICATE KEY UPDATE ${productUpdatePlaceholders}`;
                await (connection as any).execute(productQuery, [...productValues, ...productValues]);

                // Sync barcodes
                const [existingBarcodes] = await (connection as any).execute('SELECT barcode FROM ProductBarcodes WHERE productId = ?', [id]);
                const existingBarcodeSet = new Set((existingBarcodes as any[]).map(b => b.barcode));
                const newBarcodeSet = new Set(barcodes);

                // Add new barcodes
                for (const barcode of newBarcodeSet) {
                  if (!existingBarcodeSet.has(barcode)) {
                    await (connection as any).execute('INSERT INTO ProductBarcodes (productId, barcode) VALUES (?, ?)', [id, barcode]);
                  }
                }

                // Remove old barcodes
                for (const barcode of existingBarcodeSet) {
                  if (!newBarcodeSet.has(barcode)) {
                    await (connection as any).execute('DELETE FROM ProductBarcodes WHERE productId = ? AND barcode = ?', [id, barcode]);
                  }
                }
              } else if (entityType === 'users') {
                const { assignedStores, ...userData } = record;

                // Update user details
                const userColumns = Object.keys(userData);
                const userValues = Object.values(userData);
                const userPlaceholders = userColumns.map(() => '?').join(', ');
                const userUpdatePlaceholders = userColumns.map(col => `${col} = ?`).join(', ');
                const userQuery = `INSERT INTO Users (${userColumns.join(', ')}) VALUES (${userPlaceholders}) ON DUPLICATE KEY UPDATE ${userUpdatePlaceholders}`;
                await (connection as any).execute(userQuery, [...userValues, ...userValues]);

                // Sync user_stores
                const [existingStores] = await (connection as any).execute('SELECT storeId FROM UserStores WHERE userId = ?', [id]);
                const existingStoreSet = new Set((existingStores as any[]).map(s => s.storeId));
                const newStoreSet = new Set(assignedStores);

                // Add new store assignments
                for (const storeId of newStoreSet) {
                  if (!existingStoreSet.has(storeId)) {
                    await (connection as any).execute('INSERT INTO UserStores (userId, storeId) VALUES (?, ?)', [id, storeId]);
                  }
                }

                // Remove old store assignments
                for (const storeId of existingStoreSet) {
                  if (!newStoreSet.has(storeId)) {
                    await (connection as any).execute('DELETE FROM UserStores WHERE userId = ? AND storeId = ?', [id, storeId]);
                  }
                }
              } else {
                let processRecord = true;
                if (tableName === 'Bills') {
                  const [rows] = await (connection as any).execute('SELECT id FROM Users WHERE id = ?', [record.createdBy]);
                  if ((rows as any[]).length === 0) {
                    console.log(`User with id ${record.createdBy} not found. Skipping bill insertion.`);
                    processRecord = false;
                  }
                }
                if (processRecord) {
                  const { storePhone, category, items, ...filteredRecord } = record;
                  const columns = Object.keys(filteredRecord);
                  const values = Object.values(filteredRecord);
                  const placeholders = columns.map(() => '?').join(', ');
                  const updatePlaceholders = columns.map(col => `${col} = ?`).join(', ');

                  const query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updatePlaceholders}`;
                  const queryParams = [...values, ...values];

                  await (connection as any).execute(query, queryParams);
                }
              }
              await logSync({ change_type: 'update', change_data: record });
            }

            await connection.commit();
            processedInFile++;
            break; // Success, exit retry loop
          } catch (lineError: any) {
            if (connection) {
              await connection.rollback();
            }
            if (lineError.code === 'ECONNRESET' && retries > 1) {
              console.log(`Connection reset. Retrying... (${retries - 1} attempts left)`);
              retries--;
              await new Promise(res => setTimeout(res, 3000)); // Wait 3 seconds before retrying
            } else {
              console.error(`Error processing line ${currentLineNumber} from ${logFile}:`, lineError);
              console.log(`Transaction for line ${currentLineNumber} rolled back. Stopping processing for this file.`);
              retries = 0; // Stop retrying
            }
          } finally {
            if (connection) {
              connection.release();
            }
          }
        }
      }

      if (processedInFile > 0) {
        processingState[logFile] = lastProcessedLine + processedInFile;
        await saveProcessingState(processingState);
        console.log(`Updated processing state for ${logFile} to line ${processingState[logFile]}.`);
      }
    }
  } catch (error) {
    console.error('A critical error occurred during log processing:', error);
  } finally {
    isProcessing = false;
  }
}

async function watchLogs() {
  try {
    const watcher = fs.watch(logsDir);
    for await (const event of watcher) {
      if (event.filename && event.filename.endsWith('.log')) {
        console.log(`Detected change in ${event.filename}.`);
        if (isConnected) {
          processLogs();
        } else {
          console.log('No internet connection. Will process when connection is back.');
        }
      }
    }
  } catch (error) {
    console.error('Error watching log directory:', error);
  }
}

watchLogs();

setInterval(checkConnection, 5000); // Check for connection every 5 seconds
checkConnection(); // Initial check
console.log('Watching for log file changes...');
