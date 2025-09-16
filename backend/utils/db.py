import os
import mysql.connector
from mysql.connector import pooling
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class DatabaseConnection:
    _pool = None

    @classmethod
    def get_connection_pool(cls):
        if cls._pool is None:
            try:
                cls._pool = pooling.MySQLConnectionPool(
                    pool_name="billing_app_pool",
                    pool_size=5,  # Adjust pool size as needed
                    host=os.getenv("DB_HOST", "localhost"),
                    user=os.getenv("DB_USER", "root"),
                    password=os.getenv("DB_PASSWORD", ""),
                    database=os.getenv("DB_NAME", "billing_app"),
                    autocommit=False # We will manage transactions manually
                )
                print("MySQL connection pool created successfully.")
            except mysql.connector.Error as err:
                print(f"Error creating connection pool: {err}")
                raise
        return cls._pool

    @classmethod
    def get_connection(cls):
        """
        Retrieves a connection from the pool.
        """
        pool = cls.get_connection_pool()
        return pool.get_connection()

    @classmethod
    def close_pool(cls):
        """
        Note: mysql.connector.pooling.MySQLConnectionPool does not have a .close() method.
        Connections are returned to the pool, and the pool itself is managed by its lifecycle.
        This method is kept for compatibility but will not explicitly close the pool.
        """
        if cls._pool:
            # Individual connections are closed when returned to the pool or when the app exits.
            # The pool itself does not have a direct close method in mysql.connector.pooling.
            print("MySQL connection pool is being managed. No explicit close method for the pool.")
            # Optionally, you could iterate and close all active connections if the pool exposed them,
            # but that's not directly available in this pooling implementation.
            cls._pool = None # Resetting the pool to force recreation if needed later

# Example usage (for testing purposes, not part of the main utility)
if __name__ == "__main__":
    try:
        # Test connection
        conn = DatabaseConnection.get_connection()
        if conn:
            print("Successfully got a connection from the pool.")
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            result = cursor.fetchone()
            print(f"Test query result: {result}")
            cursor.close()
            conn.close()
    except Exception as e:
        print(f"An error occurred during test connection: {e}")
    finally:
        DatabaseConnection.close_pool()
