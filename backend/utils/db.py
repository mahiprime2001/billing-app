from typing import Optional, Generator, List

import logging
import mysql.connector
from mysql.connector import pooling, Error as MySQLError
from contextlib import contextmanager

logger = logging.getLogger(__name__)


class DatabaseConnection:
    """
    Centralized MySQL pooled-connection manager with safe context helpers.
    - Hardcoded connection details for DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_POOL_SIZE
    - Connections default to autocommit=False (explicit commit/rollback)
    - Provides context managers for connection and cursor lifecycles
    """

    _pool: Optional[pooling.MySQLConnectionPool] = None
    _pool_size: int = 5  # Hardcoded pool size

    @classmethod
    def get_connection_pool(cls) -> pooling.MySQLConnectionPool:
        """
        Lazily create (or return) a global MySQL connection pool with hardcoded values.
        """
        if cls._pool is None:
            try:
                cls._pool = pooling.MySQLConnectionPool(
                    pool_name="billing_app_pool",
                    pool_size=cls._pool_size,
                    host="86.38.243.155",  # Hardcoded DB_HOST
                    port=3306,         # Hardcoded DB_PORT
                    user="u408450631_siri",       # Hardcoded DB_USER
                    password="Siriart@2025",       # Hardcoded DB_PASSWORD
                    database="u408450631_siri",  # Hardcoded DB_NAME
                    autocommit=False,  # manual transaction control
                    pool_reset_session=True,  # reset session between borrows
                    connection_timeout=10,  # seconds
                )
                print("MySQL connection pool created successfully with hardcoded values.")
            except MySQLError as err:
                print(f"Error creating connection pool: {err}")
                raise
        return cls._pool

    @classmethod
    def get_connection(cls) -> mysql.connector.MySQLConnection:
        """
        Retrieves a connection from the pool.
        Always release/close the connection or use the context manager below.
        """
        try:
            pool = cls.get_connection_pool()
            conn = pool.get_connection()
            # Ensure the connection is alive; reconnect if necessary
            try:
                conn.ping(reconnect=True, attempts=1, delay=0)
            except Exception:
                try:
                    conn.close()
                except Exception:
                    pass
                conn = pool.get_connection()
            return conn
        except MySQLError as e:
            print(f"Error getting connection from pool: {e}")
            raise

    @classmethod
    @contextmanager
    def get_connection_ctx(cls) -> Generator[mysql.connector.MySQLConnection, None, None]:
        """
        Context manager for pooled connection with safe rollback/close on errors.
        """
        conn = None
        try:
            conn = cls.get_connection()
            yield conn
        except Exception:
            if conn is not None:
                try:
                    conn.rollback()
                except Exception:
                    pass
            raise
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass

    @classmethod
    def create_batch_table(cls):
        """
        Creates the 'batch' table if it doesn't already exist and applies schema migrations.
        """
        create_table_query = """
        CREATE TABLE IF NOT EXISTS batch (
            id INT AUTO_INCREMENT PRIMARY KEY,
            batch_number VARCHAR(255) NOT NULL UNIQUE,
            place TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );
        """
        try:
            with cls.get_connection_ctx() as conn:
                with cls.get_cursor_ctx(conn) as cursor:
                    cursor.execute(create_table_query)
                    conn.commit()
                    print("Table 'batch' checked/created successfully.")
                    cls._apply_batch_table_migrations(conn, cursor) # Apply migrations after creation
        except MySQLError as err:
            print(f"Error creating 'batch' table: {err}")
            raise

    @classmethod
    def _apply_batch_table_migrations(cls, conn, cursor):
        """
        Applies necessary ALTER TABLE statements to update the batch table schema.
        This method is idempotent.
        """
        # Check if 'name' column exists and rename it to 'batch_number'
        try:
            cursor.execute("SHOW COLUMNS FROM batch LIKE 'name';")
            if cursor.fetchone():
                cursor.execute("ALTER TABLE batch CHANGE COLUMN name batch_number VARCHAR(255) NOT NULL UNIQUE;")
                conn.commit()
                print("Renamed 'name' to 'batch_number' in 'batch' table.")
        except MySQLError as err:
            if err.errno == 1060: # Duplicate column name, already renamed
                print("Column 'batch_number' already exists, no rename needed.")
            else:
                print(f"Error renaming 'name' to 'batch_number': {err}")
                raise

        # Check if 'description' column exists and rename it to 'place'
        try:
            cursor.execute("SHOW COLUMNS FROM batch LIKE 'description';")
            if cursor.fetchone():
                cursor.execute("ALTER TABLE batch CHANGE COLUMN description place TEXT;")
                conn.commit()
                print("Renamed 'description' to 'place' in 'batch' table.")
        except MySQLError as err:
            if err.errno == 1060: # Duplicate column name, already renamed
                print("Column 'place' already exists, no rename needed.")
            else:
                print(f"Error renaming 'description' to 'place': {err}")
                raise

        # Remove 'product_id' column if it exists
        try:
            cursor.execute("SHOW COLUMNS FROM batch LIKE 'product_id';")
            if cursor.fetchone():
                cursor.execute("ALTER TABLE batch DROP COLUMN product_id;")
                conn.commit()
                print("Removed 'product_id' column from 'batch' table.")
        except MySQLError as err:
            if err.errno == 1054: # Unknown column, already dropped
                print("Column 'product_id' does not exist, no drop needed.")
            else:
                print(f"Error dropping 'product_id' column: {err}")
                raise

    @classmethod
    def create_product_barcodes_table(cls):
        """
        Creates the 'ProductBarcodes' table if it doesn't already exist.
        """
        create_table_query = """
        CREATE TABLE IF NOT EXISTS ProductBarcodes (
            productId VARCHAR(255) NOT NULL,
            barcode VARCHAR(255) NOT NULL,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (productId, barcode),
            FOREIGN KEY (productId) REFERENCES Products(id) ON DELETE CASCADE
        );
        """
        try:
            with cls.get_connection_ctx() as conn:
                with cls.get_cursor_ctx(conn) as cursor:
                    cursor.execute(create_table_query)
                    conn.commit()
                    print("Table 'ProductBarcodes' checked/created successfully.")
        except MySQLError as err:
            print(f"Error creating 'ProductBarcodes' table: {err}")
            raise

    @classmethod
    def create_users_table(cls):
        """
        Creates the 'Users' table if it doesn't already exist and applies schema migrations.
        Ensures a 'password' column is present.
        """
        create_table_query = """
        CREATE TABLE IF NOT EXISTS Users (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            role ENUM('super_admin', 'billing_user', 'temporary_user') NOT NULL DEFAULT 'billing_user',
            sessionDuration INT DEFAULT 24,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            status ENUM('active', 'inactive') DEFAULT 'active'
        );
        """
        try:
            with cls.get_connection_ctx() as conn:
                with cls.get_cursor_ctx(conn) as cursor:
                    cursor.execute(create_table_query)
                    conn.commit()
                    print("Table 'Users' checked/created successfully.")
                    cls._apply_users_table_migrations(conn, cursor) # Apply migrations after creation
        except MySQLError as err:
            print(f"Error creating 'Users' table: {err}")
            raise

    @classmethod
    def _apply_users_table_migrations(cls, conn, cursor):
        """
        Applies necessary ALTER TABLE statements to update the Users table schema.
        This method is idempotent.
        """
        # Add 'password' column if it doesn't exist
        try:
            cursor.execute("SHOW COLUMNS FROM Users LIKE 'password';")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE Users ADD COLUMN password VARCHAR(255) NOT NULL DEFAULT 'default_password';")
                conn.commit()
                print("Added 'password' column to 'Users' table.")
        except MySQLError as err:
            print(f"Error adding 'password' column to 'Users' table: {err}")
            raise

        # Ensure 'password' column is NOT NULL and remove default if it was added
        try:
            cursor.execute("ALTER TABLE Users MODIFY COLUMN password VARCHAR(255) NOT NULL;")
            conn.commit()
            print("Ensured 'password' column in 'Users' table is NOT NULL.")
        except MySQLError as err:
            print(f"Error modifying 'password' column to NOT NULL: {err}")
            raise

    @classmethod
    def create_user_stores_table(cls):
        """
        Creates the 'UserStores' table if it doesn't already exist.
        """
        create_table_query = """
        CREATE TABLE IF NOT EXISTS UserStores (
            userId VARCHAR(255) NOT NULL,
            storeId VARCHAR(255) NOT NULL,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (userId, storeId),
            FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE,
            FOREIGN KEY (storeId) REFERENCES Stores(id) ON DELETE CASCADE
        );
        """
        try:
            with cls.get_connection_ctx() as conn:
                with cls.get_cursor_ctx(conn) as cursor:
                    cursor.execute(create_table_query)
                    conn.commit()
                    print("Table 'UserStores' checked/created successfully.")
        except MySQLError as err:
            print(f"Error creating 'UserStores' table: {err}")
            raise

    @classmethod
    def create_bills_table(cls):
        """
        Creates the 'Bills' table if it doesn't already exist and applies schema migrations.
        """
        create_table_query = """
        CREATE TABLE IF NOT EXISTS Bills (
            id VARCHAR(255) PRIMARY KEY,
            customerName VARCHAR(255),
            customerEmail VARCHAR(255),
            customerPhone VARCHAR(255),
            subtotal DECIMAL(10, 2) NOT NULL,
            tax DECIMAL(10, 2) NOT NULL,
            discountPercentage DECIMAL(5, 2) DEFAULT 0,
            discountAmount DECIMAL(10, 2) DEFAULT 0,
            total DECIMAL(10, 2) NOT NULL,
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status VARCHAR(50) DEFAULT 'Paid',
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );
        """
        try:
            with cls.get_connection_ctx() as conn:
                with cls.get_cursor_ctx(conn) as cursor:
                    cursor.execute(create_table_query)
                    conn.commit()
                    print("Table 'Bills' checked/created successfully.")
                    cls._apply_bills_table_migrations(conn, cursor)
        except MySQLError as err:
            print(f"Error creating 'Bills' table: {err}")
            raise

    @classmethod
    def create_returns_table(cls):
        """
        Creates the 'Returns' table if it doesn't already exist.
        """
        create_table_query = """
        CREATE TABLE IF NOT EXISTS Returns (
            s_no INT AUTO_INCREMENT PRIMARY KEY,
            return_id VARCHAR(36) NOT NULL UNIQUE,
            product_name VARCHAR(255) NOT NULL,
            product_id VARCHAR(255) NULL,
            customer_name VARCHAR(255) NULL,
            customer_phone_number VARCHAR(255) NULL,
            message TEXT NULL,
            refund_method ENUM('cash','upi') DEFAULT 'cash',
            bill_id VARCHAR(255) NULL,
            item_index INT NULL,
            return_amount DECIMAL(10,2) NULL,
            status ENUM('pending','approved','rejected','completed') DEFAULT 'pending',
            created_by VARCHAR(255) NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (bill_id) REFERENCES Bills(id) ON DELETE SET NULL,
            FOREIGN KEY (product_id) REFERENCES Products(id) ON DELETE SET NULL
        );
        """
        try:
            with cls.get_connection_ctx() as conn:
                with cls.get_cursor_ctx(conn) as cursor:
                    cursor.execute(create_table_query)
                    conn.commit()
                    print("Table 'Returns' checked/created successfully.")
        except MySQLError as err:
            print(f"Error creating 'Returns' table: {err}")
            raise

    @classmethod
    def _apply_bills_table_migrations(cls, conn, cursor):
        """
        Applies necessary ALTER TABLE statements to update the Bills table schema.
        This method is idempotent.
        """
        # Add 'storeId' column if it doesn't exist
        try:
            cursor.execute("SHOW COLUMNS FROM Bills LIKE 'storeId';")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE Bills ADD COLUMN storeId VARCHAR(255) NULL;")
                conn.commit()
                print("Added 'storeId' column to 'Bills' table.")
        except MySQLError as err:
            print(f"Error adding 'storeId' column to 'Bills' table: {err}")
            raise

        # Add 'createdBy' column if it doesn't exist
        try:
            cursor.execute("SHOW COLUMNS FROM Bills LIKE 'createdBy';")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE Bills ADD COLUMN createdBy VARCHAR(255) NULL;")
                conn.commit()
                print("Added 'createdBy' column to 'Bills' table.")
        except MySQLError as err:
            print(f"Error adding 'createdBy' column to 'Bills' table: {err}")
            raise

        # Add 'customerId' column if it doesn't exist
        try:
            cursor.execute("SHOW COLUMNS FROM Bills LIKE 'customerId';")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE Bills ADD COLUMN customerId VARCHAR(255) NULL;")
                conn.commit()
                print("Added 'customerId' column to 'Bills' table.")
        except MySQLError as err:
            print(f"Error adding 'customerId' column to 'Bills' table: {err}")
            raise

        # Add 'items' column if it doesn't exist (as JSON)
        try:
            cursor.execute("SHOW COLUMNS FROM Bills LIKE 'items';")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE Bills ADD COLUMN items JSON NULL;")
                conn.commit()
                print("Added 'items' column to 'Bills' table.")
        except MySQLError as err:
            print(f"Error adding 'items' column to 'Bills' table: {err}")
            raise

    @staticmethod
    @contextmanager
    def get_cursor_ctx(conn: mysql.connector.MySQLConnection, dictionary: bool = False):
        """
        Context manager for a cursor tied to an existing connection.
        Ensures cursor.close() is called.
        """
        cursor = None
        try:
            cursor = conn.cursor(dictionary=dictionary)
            yield cursor
        finally:
            if cursor is not None:
                try:
                    cursor.close()
                except Exception:
                    pass

    @classmethod
    def get_product_barcodes(cls, product_id: str) -> List[str]:
        """
        Fetches all barcodes for a given product ID from the ProductBarcodes table.
        """
        barcodes = []
        # Try common table-name variants to handle case/underscore differences across DBs
        table_candidates = ['ProductBarcodes', 'product_barcodes', 'productbarcodes']

        for tbl in table_candidates:
            query = f"SELECT barcode FROM `{tbl}` WHERE productId = %s"
            try:
                with cls.get_connection_ctx() as conn:
                    with cls.get_cursor_ctx(conn, dictionary=True) as cursor:
                        logger.debug(f"Executing barcode query on table {tbl} for product_id={product_id}")
                        cursor.execute(query, (product_id,))
                        rows = cursor.fetchall()
                        if rows:
                            for row in rows:
                                # protect against missing column name
                                if 'barcode' in row:
                                    barcodes.append(row['barcode'])
                                else:
                                    # fall back to first column value
                                    val = next(iter(row.values()), None)
                                    if val is not None:
                                        barcodes.append(val)
                            logger.debug(f"Found {len(barcodes)} barcodes for product {product_id} in table {tbl}")
                            break
                        else:
                            logger.debug(f"No barcodes found in table {tbl} for product {product_id}")
            except MySQLError as err:
                # Table may not exist or other DB error; log and try next candidate
                logger.debug(f"Table {tbl} not usable or query failed: {err}")
                continue
            except Exception as e:
                logger.error(f"Unexpected error fetching barcodes from {tbl} for product {product_id}: {e}", exc_info=True)
                continue

        if not barcodes:
            logger.debug(f"No barcodes returned for product {product_id} after trying candidates: {table_candidates}")

        return barcodes
