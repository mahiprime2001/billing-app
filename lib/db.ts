import { createPool, Pool, PoolConnection, PoolOptions, RowDataPacket } from 'mysql2/promise';
import { logger } from './logger';
import { isDev, getAppDataPath } from './utils';
import * as fs from 'fs-extra';

// Define database configuration interface
export interface DatabaseConfig extends PoolOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  waitForConnections?: boolean;
  connectionLimit?: number;
  queueLimit?: number;
  debug?: boolean;
  ssl?: any;
}

// Default database configuration
const defaultConfig: DatabaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'siri_admin',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  debug: isDev,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
};

class Database {
  private static instance: Database;
  private pool: Pool | null = null;
  private config: DatabaseConfig;
  private isConnected = false;
  private retryAttempts = 0;
  private readonly maxRetryAttempts = 5;
  private readonly retryDelay = 2000; // 2 seconds

  private constructor(config: DatabaseConfig = defaultConfig) {
    this.config = { ...defaultConfig, ...config };
    this.initialize();
  }

  public static getInstance(config?: DatabaseConfig): Database {
    if (!Database.instance) {
      Database.instance = new Database(config);
    }
    return Database.instance;
  }

  private async initialize(): Promise<void> {
    try {
      // Ensure data directory exists
      const dataDir = getAppDataPath();
      await fs.ensureDir(dataDir);
      
      // For development, use SQLite if no MySQL config is provided
      if (isDev && !process.env.DB_HOST) {
        logger.warn('No database configuration found. Using SQLite for development.');
        await this.initializeSQLite();
        return;
      }

      await this.initializeMySQL();
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      await this.handleConnectionError(error);
    }
  }

  private async initializeMySQL(): Promise<void> {
    try {
      this.pool = createPool(this.config);
      
      // Test the connection
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      
      this.isConnected = true;
      this.retryAttempts = 0;
      
      logger.info('Successfully connected to MySQL database', {
        host: this.config.host,
        database: this.config.database,
      });
      
      // Set up connection error handling
      this.pool.on('connection', (connection) => {
        logger.debug('New database connection established');
        
        connection.on('error', async (err) => {
          logger.error('Database connection error:', err);
          this.isConnected = false;
          await this.handleConnectionError(err);
        });
      });
      
      // Set up pool error handling
      this.pool.on('acquire', (connection) => {
        logger.debug('Connection %d acquired', connection.threadId);
      });
      
      this.pool.on('release', (connection) => {
        logger.debug('Connection %d released', connection.threadId);
      });
      
      this.pool.on('enqueue', () => {
        logger.debug('Waiting for available connection slot');
      });
      
    } catch (error) {
      logger.error('Failed to connect to MySQL database:', error);
      await this.handleConnectionError(error);
    }
  }

  private async initializeSQLite(): Promise<void> {
    try {
      // Only import SQLite if it's needed
      if (isDev && !process.env.DB_HOST) {
        logger.warn('SQLite is not configured for production use. Please set up MySQL for production.');
        
        // In a real implementation, you would set up SQLite connection here
        // For now, we'll just simulate a successful connection
        this.isConnected = true;
        this.retryAttempts = 0;
        
        logger.info('SQLite database would be initialized in development mode');
      } else {
        throw new Error('SQLite is only supported in development mode when no MySQL host is configured');
      }
    } catch (error) {
      logger.error('Failed to initialize SQLite:', error);
      await this.handleConnectionError(error);
    }
  }

  private async handleConnectionError(error: any): Promise<void> {
    this.isConnected = false;
    this.retryAttempts++;

    if (this.retryAttempts <= this.maxRetryAttempts) {
      const delay = this.retryDelay * Math.pow(2, this.retryAttempts - 1);
      logger.warn(`Retrying database connection (attempt ${this.retryAttempts}/${this.maxRetryAttempts}) in ${delay}ms`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      await this.initialize();
    } else {
      logger.error('Max retry attempts reached. Could not connect to database.', {
        error: error.message,
        code: error.code,
      });
      
      // In a production app, you might want to gracefully shut down or enter a degraded mode
      process.exit(1);
    }
  }

  public async getConnection(): Promise<PoolConnection> {
    if (!this.pool || !this.isConnected) {
      throw new Error('Database connection is not established');
    }
    
    try {
      return await this.pool.getConnection();
    } catch (error) {
      logger.error('Failed to get database connection:', error);
      throw error;
    }
  }

  public async query<T = any>(sql: string, params: any[] = []): Promise<T> {
    if (!this.pool || !this.isConnected) {
      throw new Error('Database connection is not established');
    }
    
    try {
      const [rows] = await this.pool.query<RowDataPacket[]>(sql, params);
      return rows as unknown as T;
    } catch (error) {
      logger.error('Database query failed:', {
        sql,
        params,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  public async execute<T = any>(sql: string, params: any[] = []): Promise<T> {
    if (!this.pool || !this.isConnected) {
      throw new Error('Database connection is not established');
    }
    
    try {
      const [result] = await this.pool.execute<RowDataPacket[]>(sql, params);
      return result as unknown as T;
    } catch (error) {
      logger.error('Database execute failed:', {
        sql,
        params,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  public async transaction<T>(callback: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.getConnection();
    
    try {
      await connection.beginTransaction();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      logger.error('Transaction failed, rolled back', { error });
      throw error;
    } finally {
      connection.release();
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.end();
        this.isConnected = false;
        logger.info('Database connection pool closed');
      } catch (error) {
        logger.error('Error closing database connection pool:', error);
        throw error;
      }
    }
  }

  public isDatabaseConnected(): boolean {
    return this.isConnected;
  }
}

// Export a singleton instance
export const db = Database.getInstance();

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT. Closing database connections...');
  await db.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM. Closing database connections...');
  await db.close();
  process.exit(0);
});

export default db;
