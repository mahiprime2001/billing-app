import { promises as fs } from 'fs';
import path from 'path';
import { db } from '../lib/db';
import { logger } from '../lib/logger';

class Migrator {
  private migrationsPath: string;
  private migrationsTable = 'migrations';

  constructor() {
    // Path to migrations directory relative to the project root
    this.migrationsPath = path.join(process.cwd(), 'migrations');
  }

  /**
   * Initialize the migrations table if it doesn't exist
   */
  private async ensureMigrationsTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        batch INT UNSIGNED NOT NULL,
        executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY idx_migrations_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await db.execute(query);
  }

  /**
   * Get all migrations that have already been run
   */
  private async getExecutedMigrations(): Promise<Set<string>> {
    try {
      await this.ensureMigrationsTable();
      const [rows] = await db.query(`SELECT name FROM ${this.migrationsTable}`) as [any[], any];
      return new Set(rows.map((row: any) => row.name));
    } catch (error) {
      logger.error('Error getting executed migrations:', error);
      throw error;
    }
  }

  /**
   * Get all migration files from the filesystem
   */
  private async getMigrationFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.migrationsPath);
      return files
        .filter(file => file.endsWith('.sql'))
        .sort();
    } catch (error) {
      logger.error('Error reading migration files:', error);
      throw error;
    }
  }

  /**
   * Parse a migration file into its components
   */
  private parseMigrationFile(content: string): { up: string } {
    const upMatch = /--\s*Up\s*([\s\S]*?)(?:--\s*Down|$)/i.exec(content);
    
    if (!upMatch) {
      throw new Error('Invalid migration file: missing UP section');
    }

    return {
      up: upMatch[1].trim(),
    };
  }

  /**
   * Get the next batch number
   */
  private async getNextBatchNumber(): Promise<number> {
    const [rows] = await db.query(`SELECT MAX(batch) as max_batch FROM ${this.migrationsTable}`) as [any[], any];
    return (rows[0]?.max_batch || 0) + 1;
  }

  /**
   * Run all pending migrations
   */
  public async up(): Promise<void> {
    try {
      logger.info('Starting database migrations...');
      
      const migrationFiles = await this.getMigrationFiles();
      const executedMigrations = await this.getExecutedMigrations();
      const pendingMigrations = migrationFiles.filter(file => !executedMigrations.has(file));

      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations.');
        return;
      }

      const batchNumber = await this.getNextBatchNumber();
      logger.info(`Running ${pendingMigrations.length} migration(s) in batch ${batchNumber}...`);

      for (const file of pendingMigrations) {
        const filePath = path.join(this.migrationsPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const { up } = this.parseMigrationFile(content);
        
        // Start a transaction
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
          // Execute migration SQL
          await connection.query(up);
          
          // Record migration
          await connection.query(
            `INSERT INTO ${this.migrationsTable} (name, batch) VALUES (?, ?)`,
            [file, batchNumber]
          );
          
          await connection.commit();
          logger.info(`✓ ${file}`);
        } catch (error) {
          await connection.rollback();
          logger.error(`✗ ${file} - Migration failed:`, error);
          throw error;
        } finally {
          connection.release();
        }
      }

      logger.info('All migrations completed successfully.');
    } catch (error) {
      logger.error('Migration failed:', error);
      throw error;
    }
  }

  /**
   * Rollback the last batch of migrations
   */
  public async down(): Promise<void> {
    try {
      logger.info('Rolling back last batch of migrations...');
      
      // Get the latest batch number
      const [batchRows] = await db.query(
        `SELECT batch FROM ${this.migrationsTable} GROUP BY batch ORDER BY batch DESC LIMIT 1`
      ) as [any[], any];
      
      if (batchRows.length === 0) {
        logger.info('No migrations to roll back.');
        return;
      }
      
      const batchNumber = batchRows[0].batch;
      const [migrations] = await db.query(
        `SELECT * FROM ${this.migrationsTable} WHERE batch = ? ORDER BY id DESC`,
        [batchNumber]
      ) as [any[], any];
      
      if (migrations.length === 0) {
        logger.info('No migrations to roll back.');
        return;
      }
      
      logger.info(`Rolling back batch ${batchNumber} (${migrations.length} migration(s))...`);
      
      for (const migration of migrations) {
        const filePath = path.join(this.migrationsPath, migration.name);
        
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const downMatch = /--\s*Down\s*([\s\S]*)$/i.exec(content);
          
          if (!downMatch) {
            logger.warn(`No DOWN section found in ${migration.name}, skipping...`);
            continue;
          }
          
          const downSql = downMatch[1].trim();
          
          if (!downSql) {
            logger.warn(`Empty DOWN section in ${migration.name}, skipping...`);
            continue;
          }
          
          // Start a transaction
          const connection = await db.getConnection();
          await connection.beginTransaction();
          
          try {
            // Execute rollback SQL
            await connection.query(downSql);
            
            // Remove migration record
            await connection.query(
              `DELETE FROM ${this.migrationsTable} WHERE id = ?`,
              [migration.id]
            );
            
            await connection.commit();
            logger.info(`✓ Rolled back: ${migration.name}`);
          } catch (error) {
            await connection.rollback();
            logger.error(`✗ Failed to roll back ${migration.name}:`, error);
            throw error;
          } finally {
            connection.release();
          }
        } catch (error) {
          logger.error(`Error processing migration file ${migration.name}:`, error);
          throw error;
        }
      }
      
      logger.info('Rollback completed.');
    } catch (error) {
      logger.error('Rollback failed:', error);
      throw error;
    }
  }

  /**
   * Show the status of all migrations
   */
  public async status(): Promise<void> {
    try {
      const migrationFiles = await this.getMigrationFiles();
      
      logger.info('Migration Status');
      logger.info('================');
      
      if (migrationFiles.length === 0) {
        logger.info('No migration files found.');
        return;
      }
      
      const [batchRows] = await db.query(
        `SELECT name, batch, executed_at FROM ${this.migrationsTable} ORDER BY id DESC`
      ) as [any[], any];
      
      const batchMap = new Map<string, { batch: number; executedAt: string }>();
      for (const row of batchRows) {
        batchMap.set(row.name, {
          batch: row.batch,
          executedAt: row.executed_at,
        });
      }
      
      let hasPending = false;
      
      for (const file of migrationFiles) {
        const status = batchMap.has(file) ? '✓' : ' ';
        const info = batchMap.get(file);
        const batchInfo = info ? `(batch ${info.batch}, ${info.executedAt})` : '(pending)';
        
        if (!info) hasPending = true;
        
        logger.info(`[${status}] ${file} ${batchInfo}`);
      }
      
      if (hasPending) {
        logger.info('\nRun `npm run migrate:up` to apply pending migrations.');
      }
      
      logger.info('');
    } catch (error) {
      logger.error('Error getting migration status:', error);
      throw error;
    }
  }
}

// Handle command line arguments
async function main() {
  const command = process.argv[2] || 'status';
  const migrator = new Migrator();
  
  try {
    switch (command.toLowerCase()) {
      case 'up':
        await migrator.up();
        break;
      case 'down':
        await migrator.down();
        break;
      case 'status':
      default:
        await migrator.status();
        break;
    }
  } catch (error) {
    logger.error('Migration command failed:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
  
  process.exit(0);
}

// Run the migrator if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    logger.error('Unhandled error in migration script:', error);
    process.exit(1);
  });
}

export { Migrator };

// This file provides a complete migration system for the Siri Admin application.
// It allows running migrations up and down, and checking the current migration status.
// The migrations are stored in the 'migrations' directory and are executed in order.
// Each migration file should have an '-- Up' section with the SQL to apply the migration
// and an optional '-- Down' section with the SQL to revert it.
