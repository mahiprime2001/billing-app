import 'dotenv/config';
import pool from '../../../lib/mysql';
import fs from 'fs/promises';
import path from 'path';
import dns from 'dns';

const logsDir = path.join(process.cwd(), 'app', 'data', 'logs');
const stateFilePath = path.join(logsDir, 'processing_state.json');
let isConnected = false;
let isProcessing = false;

function checkConnection() {
  dns.lookup('google.com', (err) => {
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

async function processLogs() {
  if (isProcessing || !isConnected) return;
  isProcessing = true;

  const processingState = await loadProcessingState();

  try {
    const logFiles = (await fs.readdir(logsDir)).filter(file => file.endsWith('.log') && !['sync.log', 'processing_state.json'].includes(file));

    for (const logFile of logFiles) {
      const logFilePath = path.join(logsDir, logFile);
      const logData = await fs.readFile(logFilePath, 'utf-8');
      const logLines = logData.split('\n').filter(line => line.trim() !== '');

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
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
          if (logFile.startsWith('products')) {
            const match = line.match(/(\S+) - New product created: (.*) \(ID: (\d+)\)/);
            if (match) {
              const [_, timestamp, name, id] = match;
              const createdAt = new Date(timestamp);
              const updatedAt = createdAt;
              await connection.execute(
                'INSERT INTO Products (id, name, price, stock, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = ?, price = ?, stock = ?, description = ?, updatedAt = ?',
                [id, name, 0, 0, null, createdAt, updatedAt, name, 0, 0, null, updatedAt]
              );
            }
          } else if (logFile.startsWith('stores')) {
            const deleteMatch = line.match(/(\S+) - Store deleted: (.*) \(ID: (.*)\)/);
            if (deleteMatch) {
              const [_, timestamp, name, id] = deleteMatch;
              await connection.execute('DELETE FROM Stores WHERE id = ?', [id]);
            } else {
              const createMatch = line.match(/(\S+) - New store created: (.*) \(ID: (.*)\)/);
              if (createMatch) {
                const [_, timestamp, name, id] = createMatch;
                const createdAt = new Date(timestamp);
                const updatedAt = createdAt;
                await connection.execute(
                  'INSERT IGNORE INTO Stores (id, name, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
                  [id, name, 'active', createdAt, updatedAt]
                );
              }
            }
          }
          await connection.commit();
          processedInFile++;
        } catch (lineError) {
          console.error(`Error processing line ${currentLineNumber} from ${logFile}:`, lineError);
          await connection.rollback();
          console.log(`Transaction for line ${currentLineNumber} rolled back. Stopping processing for this file.`);
          break;
        } finally {
          connection.release();
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
