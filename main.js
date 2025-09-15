const { app, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const url = require('url');

// Import our custom modules
const { logger } = require('./lib/logger');
const { windowManager } = require('./lib/windowManager');
const { db } = require('./lib/db');

// Initialize logger
logger.info('Starting Siri Admin App', { 
  version: app.getVersion(),
  node: process.versions.node,
  chrome: process.versions.chrome,
  electron: process.versions.electron 
});

// Handle creating/removing shortcuts on Windows when installing/uninstalling
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Initialize the application
async function initialize() {
  try {
    // Initialize database connection
    await initializeDatabase();
    
    // Set up IPC handlers
    setupIpcHandlers();
    
    // Create the main window
    windowManager.createMainWindow();
    
    logger.info('Application initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize application:', error);
    dialog.showErrorBox('Initialization Error', 'Failed to initialize the application. Please check the logs for details.');
    app.quit();
  }
}

// Initialize database connection
async function initializeDatabase() {
  try {
    // The db module handles its own connection and retries
    logger.info('Initializing database connection...');
    
    // Check if database is connected
    if (!db.isDatabaseConnected()) {
      throw new Error('Database connection failed after retries');
    }
    
    // Run migrations
    await runMigrations();
    
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
}

// Run database migrations
async function runMigrations() {
  // TODO: Implement database migrations
  logger.info('Running database migrations...');
  // Placeholder for migration logic
  return Promise.resolve();
}

// Set up IPC handlers
function setupIpcHandlers() {
  // App control
  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });
  
  ipcMain.handle('app:quit', () => {
    app.quit();
  });
  
  // Window control
  ipcMain.handle('window:minimize', () => {
    windowManager.getMainWindow()?.minimize();
  });
  
  ipcMain.handle('window:maximize', () => {
    const win = windowManager.getMainWindow();
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });
  
  ipcMain.handle('window:close', () => {
    windowManager.closeMainWindow();
  });
  
  // Database operations
  ipcMain.handle('db:query', async (event, { sql, params = [] }) => {
    try {
      return await db.query(sql, params);
    } catch (error) {
      logger.error('Database query failed:', { sql, params, error });
      throw error;
    }
  });
  
  ipcMain.handle('db:execute', async (event, { sql, params = [] }) => {
    try {
      return await db.execute(sql, params);
    } catch (error) {
      logger.error('Database execute failed:', { sql, params, error });
      throw error;
    }
  });
  
  // File system operations
  ipcMain.handle('fs:readFile', async (event, filePath) => {
    try {
      return await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      logger.error('Failed to read file:', { filePath, error });
      throw error;
    }
  });
  
  ipcMain.handle('fs:writeFile', async (event, { filePath, content }) => {
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, content, 'utf8');
      return true;
    } catch (error) {
      logger.error('Failed to write file:', { filePath, error });
      throw error;
    }
  });
}


// Handle window closed
mainWindow.on('closed', () => {
  mainWindow = null;
});

// Handle external links
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  // Open external links in default browser
  if (!url.startsWith('file://')) {
    shell.openExternal(url);
    return { action: 'deny' };
  }
  return { action: 'allow' };
});

// Handle PDF printing
ipcMain.handle('print-pdf', async (event, base64Pdf) => {
  try {
    // Create a temporary file
    const tempDir = os.tmpdir();
    const tempPdfPath = path.join(tempDir, `print_${Date.now()}.pdf`);
    
    // Write the PDF to a temporary file
    await fs.promises.writeFile(tempPdfPath, Buffer.from(base64Pdf, 'base64'));
    
    // Get the default printer
    const printers = mainWindow.webContents.getPrinters();
    const defaultPrinter = printers.find(p => p.isDefault) || printers[0];
    
    if (!defaultPrinter) {
      throw new Error('No printers found');
    }

    // Print the PDF using the system's default PDF viewer
    const printCommand = process.platform === 'win32' 
      ? `start /min "" "${tempPdfPath}" /p`
      : process.platform === 'darwin'
        ? `open -a Preview "${tempPdfPath}" -g`
        : `xdg-open "${tempPdfPath}"`;

    await new Promise((resolve, reject) => {
      exec(printCommand, (error) => {
        if (error) {
          console.error('Failed to print PDF:', error);
          reject(error);
        } else {
          // Clean up the temporary file after a delay
          setTimeout(() => {
            fs.unlink(tempPdfPath, () => {});
          }, 30000); // 30 seconds delay before cleanup
          resolve(true);
        }
      });
    });

    return true;
  } catch (error) {
    console.error('Error in print-pdf handler:', error);
    return false;
  }
});

// Handle thermal printing
ipcMain.handle('print-thermal', async (event, content) => {
  try {
    // Create a temporary file with the content
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `thermal_${Date.now()}.txt`);
    
    await fs.promises.writeFile(tempFilePath, content, 'utf8');
    
    // Get the default printer
    const printers = mainWindow.webContents.getPrinters();
    const defaultPrinter = printers.find(p => p.isDefault) || printers[0];
    
    if (!defaultPrinter) {
      throw new Error('No printers found');
    }

    // Print the file using the system's default text file handler
    const printCommand = process.platform === 'win32'
      ? `notepad /p "${tempFilePath}"`
      : process.platform === 'darwin'
        ? `lp "${tempFilePath}"`
        : `lp "${tempFilePath}"`;

    await new Promise((resolve, reject) => {
      exec(printCommand, (error) => {
        if (error) {
          console.error('Failed to print thermal content:', error);
          reject(error);
        } else {
          // Clean up the temporary file after a delay
          setTimeout(() => {
            fs.unlink(tempFilePath, () => {});
          }, 30000); // 30 seconds delay before cleanup
          resolve(true);
        }
      });
    });

    return true;
  } catch (error) {
    console.error('Error in print-thermal handler:', error);
    return false;
  }
});

// This method will be called when Electron has finished initialization
app.whenReady().then(initialize);

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle activate event (macOS)
app.on('activate', () => {
  if (windowManager.getMainWindow() === null) {
    windowManager.createMainWindow();
  } else {
    windowManager.focusMainWindow();
  }
});

// Handle any uncaught exceptions
process.on('uncaughtException', (error) => {
  const errorMessage = `Uncaught Exception: ${error.message}\n${error.stack || ''}`;
  logger.error('Uncaught Exception:', { error });
  
  // Send the error to the renderer process if available
  const mainWindow = windowManager.getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('error', errorMessage);
  }
  
  // Show error dialog in production
  if (!isDev) {
    dialog.showErrorBox('An error occurred', 'An unexpected error occurred. Please check the logs for details.');
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  const errorMessage = `Unhandled Rejection at: ${promise}. Reason: ${reason}`;
  logger.error('Unhandled Rejection:', { reason });
  
  // In production, you might want to log this to a file or error tracking service
  if (!isDev) {
    dialog.showErrorBox('An error occurred', 'An unexpected error occurred. Please check the logs for details.');
  }
});

// Handle app activation (macOS)
app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle all windows closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle before quit
app.on('before-quit', () => {
  // Clean up any resources here if needed
});

// Handle second instance (prevent multiple instances)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
