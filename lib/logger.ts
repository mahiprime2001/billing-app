import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs-extra';
import { format } from 'util';
import { isDev } from './utils';

// Define log levels
enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
  TRACE = 'TRACE',
}

class Logger {
  private static instance: Logger;
  private logFile: string;
  private logLevel: LogLevel;
  private maxFileSize = 5 * 1024 * 1024; // 5MB
  private maxFiles = 5;
  private initialized = false;

  private constructor() {
    this.logLevel = isDev ? LogLevel.DEBUG : LogLevel.INFO;
    this.logFile = path.join(app.getPath('logs'), 'siri-admin.log');
    this.initialize();
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private async initialize(): Promise<void> {
    try {
      // Ensure logs directory exists
      await fs.ensureDir(path.dirname(this.logFile));
      
      // Rotate logs if needed
      await this.rotateLogs();
      
      this.initialized = true;
      this.info('Logger initialized', { logFile: this.logFile });
    } catch (error) {
      console.error('Failed to initialize logger:', error);
    }
  }

  private async rotateLogs(): Promise<void> {
    try {
      const logDir = path.dirname(this.logFile);
      const logFileName = path.basename(this.logFile, '.log');
      
      // Check if current log file needs rotation
      if (await fs.pathExists(this.logFile)) {
        const stats = await fs.stat(this.logFile);
        
        if (stats.size > this.maxFileSize) {
          // Rotate existing logs
          for (let i = this.maxFiles - 1; i > 0; i--) {
            const src = i === 1 
              ? `${logDir}/${logFileName}.log` 
              : `${logDir}/${logFileName}.${i - 1}.log`;
              
            const dest = `${logDir}/${logFileName}.${i}.log`;
            
            if (await fs.pathExists(src)) {
              await fs.rename(src, dest);
            }
          }
        }
      }
    } catch (error) {
      console.error('Log rotation failed:', error);
    }
  }

  private async writeToFile(level: LogLevel, message: string, meta?: any): Promise<void> {
    if (!this.initialized) return;
    
    try {
      const timestamp = new Date().toISOString();
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
      const logEntry = `[${timestamp}] [${level}] ${message}${metaStr}\n`;
      
      await fs.appendFile(this.logFile, logEntry, 'utf8');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = Object.values(LogLevel);
    return levels.indexOf(level) <= levels.indexOf(this.logLevel);
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    this.info(`Log level set to ${level}`);
  }

  public error(message: string, meta?: any): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    const formattedMessage = format(message, meta);
    console.error(formattedMessage);
    this.writeToFile(LogLevel.ERROR, formattedMessage, meta);
  }

  public warn(message: string, meta?: any): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    const formattedMessage = format(message, meta);
    console.warn(formattedMessage);
    this.writeToFile(LogLevel.WARN, formattedMessage, meta);
  }

  public info(message: string, meta?: any): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    const formattedMessage = format(message, meta);
    console.info(formattedMessage);
    this.writeToFile(LogLevel.INFO, formattedMessage, meta);
  }

  public debug(message: string, meta?: any): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    const formattedMessage = format(message, meta);
    console.debug(formattedMessage);
    this.writeToFile(LogLevel.DEBUG, formattedMessage, meta);
  }

  public trace(message: string, meta?: any): void {
    if (!this.shouldLog(LogLevel.TRACE)) return;
    const formattedMessage = format(message, meta);
    console.trace(formattedMessage);
    this.writeToFile(LogLevel.TRACE, formattedMessage, meta);
  }

  // Handle uncaught exceptions
  public handleUncaughtExceptions(): void {
    process.on('uncaughtException', (error: Error) => {
      this.error('Uncaught exception:', { 
        message: error.message, 
        stack: error.stack,
        name: error.name 
      });
      // Optionally, you might want to restart the app or perform cleanup
    });

    process.on('unhandledRejection', (reason: unknown) => {
      if (reason instanceof Error) {
        this.error('Unhandled promise rejection:', { 
          message: reason.message,
          stack: reason.stack,
          name: reason.name
        });
      } else if (typeof reason === 'string') {
        this.error('Unhandled promise rejection:', { reason });
      } else {
        this.error('Unhandled promise rejection:', { 
          reason: 'Unknown error',
          type: typeof reason
        });
      }
    });
  }
}

export const logger = Logger.getInstance();

// Initialize logger for main process
if (process.type === 'browser') {
  logger.handleUncaughtExceptions();
}

export default logger;
