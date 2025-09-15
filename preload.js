const { contextBridge, ipcRenderer } = require('electron');

// Store callbacks for server errors
const serverErrorCallbacks = new Set();

// Validate the origin of incoming messages
const validChannels = [
  'print-pdf',
  'print-thermal',
  'server-error',
  'app-version',
  'app-quit',
  'app-minimize',
  'app-maximize',
  'app-unmaximize',
  'app-is-maximized'
];

// Listen for server errors from the main process
ipcRenderer.on('server-error', (event, error) => {
  if (typeof error !== 'string') {
    error = 'An unknown error occurred';
  }
  
  serverErrorCallbacks.forEach(callback => {
    try {
      callback(error);
    } catch (err) {
      console.error('Error in server error callback:', err);
    }
  });
});

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  // App control
  app: {
    // Get application version
    getVersion: () => ipcRenderer.invoke('app-version'),
    // Control application window
    quit: () => ipcRenderer.send('app-quit'),
    minimize: () => ipcRenderer.send('app-minimize'),
    maximize: () => ipcRenderer.send('app-maximize'),
    unmaximize: () => ipcRenderer.send('app-unmaximize'),
    isMaximized: () => ipcRenderer.invoke('app-is-maximized'),
    // Listen for window state changes
    onMaximized: (callback) => {
      const listener = (_, isMaximized) => callback(isMaximized);
      ipcRenderer.on('app-maximized', listener);
      return () => ipcRenderer.removeListener('app-maximized', listener);
    },
    onUnmaximized: (callback) => {
      const listener = (_, isMaximized) => callback(isMaximized);
      ipcRenderer.on('app-unmaximized', listener);
      return () => ipcRenderer.removeListener('app-unmaximized', listener);
    }
  },
  
  // Printing functions
  print: {
    pdf: (base64Pdf) => {
      if (typeof base64Pdf !== 'string') {
        throw new Error('Invalid PDF data');
      }
      return ipcRenderer.invoke('print-pdf', base64Pdf);
    },
    thermal: (content) => {
      if (typeof content !== 'string' && typeof content !== 'object') {
        throw new Error('Invalid thermal print content');
      }
      return ipcRenderer.invoke('print-thermal', content);
    }
  },
  
  // Error handling
  onServerError: (callback) => {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    
    // Add the callback to our set
    serverErrorCallbacks.add(callback);
    
    // Return a cleanup function that removes the callback
    return () => {
      serverErrorCallbacks.delete(callback);
    };
  },
  
  // File system operations (expose only what's needed)
  fs: {
    readFile: (path) => ipcRenderer.invoke('fs-read-file', path),
    writeFile: (path, data) => ipcRenderer.invoke('fs-write-file', path, data),
    exists: (path) => ipcRenderer.invoke('fs-exists', path)
  },
  
  // Environment information
  env: {
    isDev: process.env.NODE_ENV === 'development',
    platform: process.platform,
    arch: process.arch
  }
});

// Security: Validate IPC channels
contextBridge.exposeInMainWorld('ipcRenderer', {
  invoke: (channel, ...args) => {
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    throw new Error(`Invalid IPC channel: ${channel}`);
  },
  on: (channel, listener) => {
    if (validChannels.includes(channel)) {
      return ipcRenderer.on(channel, listener);
    }
    throw new Error(`Invalid IPC channel: ${channel}`);
  },
  removeListener: (channel, listener) => {
    if (validChannels.includes(channel)) {
      return ipcRenderer.removeListener(channel, listener);
    }
    throw new Error(`Invalid IPC channel: ${channel}`);
  }
});
