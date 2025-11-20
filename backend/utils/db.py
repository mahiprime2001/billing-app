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
    - **DOES NOT CREATE OR MODIFY TABLES** - All tables must exist in the database
    """
    
    pool: Optional[pooling.MySQLConnectionPool] = None
    pool_size: int = 5  # Hardcoded pool size
    
    @classmethod
    def get_connection_pool(cls) -> pooling.MySQLConnectionPool:
        """
        Lazily create or return a global MySQL connection pool with hardcoded values.
        """
        if cls.pool is None:
            try:
                cls.pool = pooling.MySQLConnectionPool(
                    pool_name="billing_app_pool",
                    pool_size=cls.pool_size,
                    host="86.38.243.155",        # Hardcoded DB_HOST
                    port=3306,                   # Hardcoded DB_PORT
                    user="u408450631_siri",      # Hardcoded DB_USER
                    password="Siriart@2025",     # Hardcoded DB_PASSWORD
                    database="u408450631_siri",  # Hardcoded DB_NAME
                    autocommit=False,            # manual transaction control
                    pool_reset_session=True,     # reset session between borrows
                    connection_timeout=10        # seconds
                )
                print("MySQL connection pool created successfully with hardcoded values.")
            except MySQLError as err:
                print(f"Error creating connection pool: {err}")
                raise
        return cls.pool
    
    @classmethod
    def get_connection(cls) -> mysql.connector.MySQLConnection:
        """
        Retrieves a connection from the pool. Always release/close the connection
        or use the context manager below.
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
        table_candidates = ["ProductBarcodes", "productbarcodes", "product_barcodes"]
        
        for tbl in table_candidates:
            query = f"SELECT barcode FROM {tbl} WHERE productId = %s"
            try:
                with cls.get_connection_ctx() as conn:
                    with cls.get_cursor_ctx(conn, dictionary=True) as cursor:
                        logger.debug(f"Executing barcode query on table '{tbl}' for product_id={product_id}")
                        cursor.execute(query, (product_id,))
                        rows = cursor.fetchall()
                        
                        if rows:
                            for row in rows:
                                # protect against missing column name
                                if "barcode" in row:
                                    barcodes.append(row["barcode"])
                                else:
                                    # fall back to first column value
                                    val = next(iter(row.values()), None)
                                    if val is not None:
                                        barcodes.append(val)
                            
                            logger.debug(f"Found {len(barcodes)} barcodes for product {product_id} in table '{tbl}'")
                            break
                        else:
                            logger.debug(f"No barcodes found in table '{tbl}' for product {product_id}")
                            
            except MySQLError as err:
                # Table may not exist or other DB error - log and try next candidate
                logger.debug(f"Table '{tbl}' not usable or query failed: {err}")
                continue
            except Exception as e:
                logger.error(f"Unexpected error fetching barcodes from '{tbl}' for product {product_id}: {e}", exc_info=True)
                continue
        
        if not barcodes:
            logger.debug(f"No barcodes returned for product {product_id} after trying candidates: {table_candidates}")
        
        return barcodes
