import { BrowserWindow, app, screen, ipcMain, dialog, shell, BrowserWindowConstructorOptions } from 'electron';
import * as path from 'path';
import { isDev } from './utils';
import { logger } from './logger';

class WindowManager {
  private static instance: WindowManager;
  private mainWindow: BrowserWindow | null = null;
  private isQuitting = false;

  private constructor() {
    this.setupEventListeners();
  }

  public static getInstance(): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager();
    }
    return WindowManager.instance;
  }

  private setupEventListeners(): void {
    // Handle window close event
    app.on('before-quit', () => {
      this.isQuitting = true;
    });

    // Handle all windows closed
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    // Handle macOS activate event (when the dock icon is clicked)
    app.on('activate', () => {
      if (this.mainWindow === null) {
        this.createMainWindow();
      } else {
        this.focusMainWindow();
      }
    });

    // Handle IPC messages for window controls
    ipcMain.handle('window:minimize', () => {
      if (this.mainWindow) {
        this.mainWindow.minimize();
      }
    });

    ipcMain.handle('window:maximize', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isMaximized()) {
          this.mainWindow.unmaximize();
        } else {
          this.mainWindow.maximize();
        }
      }
    });

    ipcMain.handle('window:close', () => {
      if (this.mainWindow) {
        this.mainWindow.close();
      }
    });
  }

  public createMainWindow(): BrowserWindow {
    if (this.mainWindow) {
      return this.mainWindow;
    }

    const { width, height } = this.calculateWindowSize();

    const windowOptions: BrowserWindowConstructorOptions = {
      width,
      height,
      minWidth: 1024,
      minHeight: 768,
      show: false,
      title: 'Siri Admin',
      icon: path.join(__dirname, '../public/placeholder-logo.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload.js'),
        webSecurity: !isDev,
        sandbox: true,
        // enableRemoteModule is deprecated in newer Electron versions
        // We use contextBridge for secure IPC instead
        devTools: isDev,
      },
      frame: false,
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#ffffff',
        symbolColor: '#1e293b',
        height: 30,
      },
    };

    // Create the browser window
    this.mainWindow = new BrowserWindow(windowOptions);

    // Load the app
    const startUrl = isDev
      ? 'http://localhost:3000'
      : `file://${path.join(__dirname, '../out/index.html')}`;

    this.mainWindow.loadURL(startUrl).catch(err => {
      logger.error('Failed to load URL:', err);
      dialog.showErrorBox('Error', 'Failed to load the application');
    });

    // Open the DevTools in development mode
    if (isDev) {
      this.mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    // Handle window events
    this.mainWindow.on('ready-to-show', () => {
      if (this.mainWindow) {
        this.mainWindow.show();
        this.mainWindow.focus();
      }
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
      if (process.platform !== 'darwin' && !this.isQuitting) {
        app.quit();
      }
    });

    this.mainWindow.on('maximize', () => {
      this.mainWindow?.webContents.send('window:maximized', true);
    });

    this.mainWindow.on('unmaximize', () => {
      this.mainWindow?.webContents.send('window:maximized', false);
    });

    // Handle external links
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (!url.startsWith('file://')) {
        shell.openExternal(url).catch(err => {
          logger.error('Failed to open external URL:', { url, error: err });
        });
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });

    // Handle web contents events
    this.mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
      logger.error('Failed to load content:', { errorCode, errorDescription });
    });

    // Handle renderer process crashes
    this.mainWindow.webContents.on('render-process-gone', (_, details) => {
      logger.error('Renderer process crashed or killed:', {
        reason: details.reason,
        exitCode: details.exitCode,
        ...(details.reason === 'crashed' && { 
          crashReason: 'The renderer process has crashed. Please save your work and restart the application.'
        }),
        ...(details.reason === 'killed' && { 
          killReason: 'The renderer process was killed. Please save your work and restart the application.'
        })
      });
      
      // Show error dialog in production
      if (!isDev) {
        dialog.showErrorBox(
          'Application Error', 
          'The application has encountered an error and needs to restart. Please save your work and restart the application.'
        );
      }
    });

    return this.mainWindow;
  }

  private calculateWindowSize(): { width: number; height: number } {
    const { workAreaSize } = screen.getPrimaryDisplay();
    const width = Math.min(1440, Math.floor(workAreaSize.width * 0.9));
    const height = Math.min(900, Math.floor(workAreaSize.height * 0.9));
    return { width, height };
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  public focusMainWindow(): void {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.focus();
    }
  }

  public closeMainWindow(): void {
    if (this.mainWindow) {
      this.mainWindow.close();
    }
  }

  public toggleDevTools(): void {
    if (this.mainWindow) {
      this.mainWindow.webContents.toggleDevTools();
    }
  }

  public reloadMainWindow(): void {
    if (this.mainWindow) {
      this.mainWindow.reload();
    }
  }

  public isMainWindowMaximized(): boolean {
    return this.mainWindow ? this.mainWindow.isMaximized() : false;
  }
}

export const windowManager = WindowManager.getInstance();
export default windowManager;
