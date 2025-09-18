import os
import mysql.connector
from mysql.connector import pooling, Error as MySQLError
from contextlib import contextmanager
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class DatabaseConnection:
    _pool = None
    _pool_size = 5  # Default pool size

    @classmethod
    def get_connection_pool(cls):
        if cls._pool is None:
            try:
                cls._pool = pooling.MySQLConnectionPool(
                    pool_name="billing_app_pool",
                    pool_size=cls._pool_size,
                    host=os.getenv("DB_HOST", "localhost"),
                    user=os.getenv("DB_USER", "root"),
                    password=os.getenv("DB_PASSWORD", ""),
                    database=os.getenv("DB_NAME", "billing_app"),
                    autocommit=False,  # We manage transactions manually
                    pool_reset_session=True,
                    connect_timeout=10,
                    connection_timeout=10
                )
                print("MySQL connection pool created successfully.")
            except MySQLError as err:
                print(f"Error creating connection pool: {err}")
                raise
        return cls._pool

    @classmethod
    def get_connection(cls):
        """
        Retrieves a connection from the pool.
        Always use this within a 'with' statement or ensure proper cleanup.
        """
        try:
            pool = cls.get_connection_pool()
            connection = pool.get_connection()
            return connection
        except MySQLError as e:
            print(f"Error getting database connection: {e}")
            raise

    @classmethod
    @contextmanager
    def get_connection_ctx(cls):
        """
        Context manager for database connections.
        Ensures proper connection cleanup.
        
        Usage:
            with DatabaseConnection.get_connection_ctx() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM table")
                result = cursor.fetchall()
        """
        conn = None
        try:
            conn = cls.get_connection()
            yield conn
        except MySQLError as e:
            if conn and conn.in_transaction:
                conn.rollback()
            print(f"Database error: {e}")
            raise
        finally:
            if conn:
                conn.close()

    @classmethod
    def close_pool(cls):
        """
        Closes all connections in the pool.
        Note: This should typically only be called during application shutdown.
        """
        if cls._pool:
            try:
                # Get all connections from the pool and close them
                connections = []
                for _ in range(cls._pool_size):
                    try:
                        conn = cls._pool.get_connection()
                        connections.append(conn)
                    except:
                        break
                
                # Close all connections
                for conn in connections:
                    try:
                        if conn.is_connected():
                            conn.close()
                    except:
                        pass
                
                print("All database connections closed.")
            except Exception as e:
                print(f"Error closing connection pool: {e}")
            finally:
                cls._pool = None

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
