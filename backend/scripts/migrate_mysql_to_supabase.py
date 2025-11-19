"""
MySQL to Supabase Data Migration Script
Migrates all data from existing MySQL database to Supabase
Uses: uv environment
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import mysql.connector
from supabase import create_client, Client
from dotenv import load_dotenv
from typing import List, Dict, Optional
import logging
from datetime import datetime
import json

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('migration.log')
    ]
)
logger = logging.getLogger(__name__)

# Load environment
load_dotenv()

# MySQL Configuration
MYSQL_CONFIG = {
    'host': os.getenv("MYSQL_HOST", "86.38.243.155"),
    'port': int(os.getenv("MYSQL_PORT", "3306")),
    'user': os.getenv("MYSQL_USER", "u408450631_siri"),
    'password': os.getenv("MYSQL_PASSWORD", "Siriart@2025"),
    'database': os.getenv("MYSQL_DATABASE", "u408450631_siri")
}

# Supabase Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("❌ SUPABASE_URL and SUPABASE_KEY must be set in .env file")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


class DataMigrator:
    """Handles data migration from MySQL to Supabase"""
    
    def __init__(self):
        self.mysql_conn = None
        self.stats = {
            'tables_migrated': 0,
            'total_records': 0,
            'errors': [],
            'table_stats': {}
        }
    
    def connect_mysql(self) -> bool:
        """Connect to MySQL database"""
        try:
            self.mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
            logger.info("✅ Connected to MySQL database")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to connect to MySQL: {e}")
            return False
    
    def fetch_mysql_data(self, table_name: str) -> List[Dict]:
        """Fetch all data from MySQL table"""
        try:
            cursor = self.mysql_conn.cursor(dictionary=True)
            cursor.execute(f"SELECT * FROM {table_name}")
            data = cursor.fetchall()
            cursor.close()
            
            # Convert datetime objects to ISO format strings
            for row in data:
                for key, value in row.items():
                    if isinstance(value, datetime):
                        row[key] = value.isoformat()
                    elif isinstance(value, bytes):
                        try:
                            row[key] = value.decode('utf-8')
                        except:
                            row[key] = str(value)
            
            logger.info(f"📥 Fetched {len(data)} records from MySQL table: {table_name}")
            return data
        except Exception as e:
            logger.error(f"❌ Error fetching data from {table_name}: {e}")
            self.stats['errors'].append(f"{table_name}: {str(e)}")
            return []
    
    def insert_supabase_batch(self, table_name: str, data: List[Dict], batch_size: int = 100) -> int:
        """Insert data into Supabase in batches"""
        if not data:
            logger.warning(f"⚠️  No data to migrate for table: {table_name}")
            return 0
        
        total_inserted = 0
        failed_records = []
        
        # Process in batches
        for i in range(0, len(data), batch_size):
            batch = data[i:i + batch_size]
            try:
                response = supabase.table(table_name).insert(batch).execute()
                total_inserted += len(batch)
                logger.info(f"📤 Batch {i//batch_size + 1}: Inserted {len(batch)} records into {table_name}")
            except Exception as e:
                logger.warning(f"⚠️  Batch insert failed for {table_name}, trying individual inserts...")
                logger.debug(f"Batch error: {e}")
                
                # Try inserting records one by one if batch fails
                for record in batch:
                    try:
                        supabase.table(table_name).insert(record).execute()
                        total_inserted += 1
                    except Exception as single_error:
                        logger.error(f"❌ Failed to insert single record in {table_name}")
                        logger.debug(f"Record error: {single_error}")
                        logger.debug(f"Problem record: {record}")
                        failed_records.append(record)
        
        if failed_records:
            self.stats['errors'].append(f"{table_name}: {len(failed_records)} records failed")
            # Save failed records to file for manual review
            with open(f"failed_{table_name}.json", "w") as f:
                json.dump(failed_records, f, indent=2)
            logger.warning(f"⚠️  Saved {len(failed_records)} failed records to failed_{table_name}.json")
        
        return total_inserted
    
    def migrate_table(self, mysql_table: str, supabase_table: str):
        """Migrate a single table from MySQL to Supabase"""
        logger.info(f"\n{'='*60}")
        logger.info(f"📦 Migrating: {mysql_table} → {supabase_table}")
        logger.info(f"{'='*60}")
        
        # Fetch data from MySQL
        data = self.fetch_mysql_data(mysql_table)
        
        if not data:
            logger.warning(f"⚠️  Skipping {mysql_table} - no data found")
            self.stats['table_stats'][supabase_table] = 0
            return
        
        # Insert data into Supabase
        inserted_count = self.insert_supabase_batch(supabase_table, data)
        
        self.stats['tables_migrated'] += 1
        self.stats['total_records'] += inserted_count
        self.stats['table_stats'][supabase_table] = inserted_count
        
        logger.info(f"✅ Completed {supabase_table}: {inserted_count}/{len(data)} records")
    
    def migrate_all(self):
        """Migrate all tables in correct dependency order"""
        logger.info("\n" + "="*60)
        logger.info("🚀 Starting MySQL to Supabase Migration")
        logger.info("="*60 + "\n")
        
        if not self.connect_mysql():
            logger.error("❌ Cannot proceed without MySQL connection")
            return
        
        # Define migration order (respecting foreign key dependencies)
        # Format: (mysql_table_name, supabase_table_name)
        migration_order = [
            # Independent tables first
            ('app_config', 'app_config'),
            ('SystemSettings', 'systemsettings'),
            ('BillFormats', 'billformats'),
            
            # Core entities
            ('Stores', 'stores'),
            ('batch', 'batch'),
            ('Customers', 'customers'),
            ('Users', 'users'),
            
            # Dependent tables
            ('UserStores', 'userstores'),
            ('Products', 'products'),
            ('ProductBarcodes', 'productbarcodes'),
            ('Bills', 'bills'),
            ('BillItems', 'billitems'),
            ('Returns', 'returns'),
            ('notifications', 'notifications'),
            ('password_reset_tokens', 'password_reset_tokens'),
            ('password_change_log', 'password_change_log'),
            ('sync_table', 'sync_table'),
        ]
        
        for mysql_table, supabase_table in migration_order:
            try:
                self.migrate_table(mysql_table, supabase_table)
            except Exception as e:
                logger.error(f"❌ Failed to migrate {mysql_table}: {e}")
                self.stats['errors'].append(f"{mysql_table}: {str(e)}")
        
        # Close MySQL connection
        if self.mysql_conn:
            self.mysql_conn.close()
            logger.info("\n🔌 Closed MySQL connection")
        
        # Print final statistics
        self.print_summary()
    
    def print_summary(self):
        """Print migration summary"""
        logger.info("\n" + "="*60)
        logger.info("📊 MIGRATION SUMMARY")
        logger.info("="*60)
        logger.info(f"✅ Tables migrated: {self.stats['tables_migrated']}")
        logger.info(f"✅ Total records migrated: {self.stats['total_records']}")
        
        logger.info("\n📈 Per-table statistics:")
        for table, count in self.stats['table_stats'].items():
            logger.info(f"  • {table}: {count} records")
        
        if self.stats['errors']:
            logger.warning(f"\n⚠️  Errors encountered: {len(self.stats['errors'])}")
            for error in self.stats['errors']:
                logger.warning(f"  - {error}")
        else:
            logger.info("\n🎉 Migration completed successfully with no errors!")
        
        logger.info("="*60 + "\n")
    
    def verify_migration(self):
        """Verify data was migrated correctly"""
        logger.info("\n" + "="*60)
        logger.info("🔍 Verifying migration...")
        logger.info("="*60 + "\n")
        
        tables_to_verify = [
            'stores', 'products', 'customers', 'users', 
            'bills', 'billitems', 'batch', 'productbarcodes'
        ]
        
        for table_name in tables_to_verify:
            try:
                # Count records in Supabase
                response = supabase.table(table_name).select("*", count="exact").execute()
                count = response.count if hasattr(response, 'count') else len(response.data)
                
                # Compare with migration stats
                expected = self.stats['table_stats'].get(table_name, 0)
                status = "✅" if count == expected else "⚠️"
                logger.info(f"{status} {table_name}: {count} records in Supabase (expected: {expected})")
            except Exception as e:
                logger.error(f"❌ Error verifying {table_name}: {e}")


def main():
    """Main migration execution"""
    print("""
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║       MySQL to Supabase Data Migration Tool               ║
║       Using UV Environment                                ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    """)
    
    # Confirmation prompt
    response = input("\n⚠️  This will migrate ALL data from MySQL to Supabase.\n   Existing data in Supabase tables will NOT be deleted.\n   Continue? (yes/no): ")
    if response.lower() != 'yes':
        print("❌ Migration cancelled.")
        return
    
    # Create migrator and run
    migrator = DataMigrator()
    migrator.migrate_all()
    
    # Verify migration
    verify = input("\n🔍 Would you like to verify the migration? (yes/no): ")
    if verify.lower() == 'yes':
        migrator.verify_migration()
    
    print("\n✅ Migration process complete! Check migration.log for details.")


if __name__ == "__main__":
    main()
