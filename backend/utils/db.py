from typing import Optional, Generator

import mysql.connector
from mysql.connector import pooling, Error as MySQLError
from contextlib import contextmanager


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
