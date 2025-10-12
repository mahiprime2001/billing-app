import os
from typing import Optional, Generator

import mysql.connector
from mysql.connector import pooling, Error as MySQLError
from contextlib import contextmanager
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()


class DatabaseConnection:
    """
    Centralized MySQL pooled-connection manager with safe context helpers.
    - Respects env vars: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_POOL_SIZE
    - Connections default to autocommit=False (explicit commit/rollback)
    - Provides context managers for connection and cursor lifecycles
    """

    _pool: Optional[pooling.MySQLConnectionPool] = None
    _pool_size: int = int(os.getenv("DB_POOL_SIZE", "5"))

    @classmethod
    def get_connection_pool(cls) -> pooling.MySQLConnectionPool:
        """
        Lazily create (or return) a global MySQL connection pool.
        """
        if cls._pool is None:
            try:
                cls._pool = pooling.MySQLConnectionPool(
                    pool_name="billing_app_pool",
                    pool_size=cls._pool_size,
                    host=os.getenv("DB_HOST", "localhost"),
                    port=int(os.getenv("DB_PORT", "3306")),
                    user=os.getenv("DB_USER", "root"),
                    password=os.getenv("DB_PASSWORD", ""),
                    database=os.getenv("DB_NAME", "billing_app"),
                    autocommit=False,              # manual transaction control
                    pool_reset_session=True,       # reset session between borrows
                    connection_timeout=10,         # seconds
                )
                print("MySQL connection pool created successfully.")
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
