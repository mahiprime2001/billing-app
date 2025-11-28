import os
import sys
import logging

# Resolve project root for imports (supports both development and PyInstaller bundle)
if getattr(sys, 'frozen', False):
    PROJECT_ROOT = os.path.dirname(sys._MEIPASS)  # type: ignore
else:
    PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from utils.db import DatabaseConnection

logger = logging.getLogger(__name__)
if not logger.handlers:
    # Local logger fallback if caller doesn't pass logger_instance
    import io
    utf8_stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    handler = logging.StreamHandler(utf8_stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

def create_tables():
    bills_table_sql = """
    CREATE TABLE Bills (
      id VARCHAR(255) NOT NULL PRIMARY KEY,
      storeId VARCHAR(255),
      storeName VARCHAR(255),
      storeAddress TEXT,
      customerName VARCHAR(255),
      customerPhone VARCHAR(255),
      customerEmail VARCHAR(255),
      customerAddress TEXT,
      customerId VARCHAR(255),
      subtotal DECIMAL(10,2),
      taxPercentage DECIMAL(5,2),
      taxAmount DECIMAL(10,2),
      discountPercentage DECIMAL(5,2),
      discountAmount DECIMAL(10,2),
      total DECIMAL(10,2),
      paymentMethod VARCHAR(50),
      timestamp DATETIME,
      notes TEXT,
      gstin VARCHAR(255),
      companyName VARCHAR(255),
      companyAddress TEXT,
      companyPhone VARCHAR(255),
      companyEmail VARCHAR(255),
      billFormat VARCHAR(50),
      createdBy VARCHAR(255),
      items LONGTEXT,
      CONSTRAINT Bills_ibfk_1 FOREIGN KEY (storeId) REFERENCES Stores(id),
      CONSTRAINT Bills_ibfk_2 FOREIGN KEY (createdBy) REFERENCES Users(id),
      CONSTRAINT Bills_ibfk_3 FOREIGN KEY (customerId) REFERENCES Customers(id)
    );
    """

    billitems_table_sql = """
    CREATE TABLE BillItems (
      id BIGINT(20) NOT NULL AUTO_INCREMENT PRIMARY KEY,
      billId VARCHAR(255),
      productId VARCHAR(255),
      productName VARCHAR(255),
      quantity INT(11),
      price DECIMAL(10,2),
      total DECIMAL(10,2),
      tax DECIMAL(10,2) DEFAULT 0.00,
      gstRate DECIMAL(10,2) DEFAULT 0.00,
      barcodes TEXT,
      CONSTRAINT BillItems_ibfk_1 FOREIGN KEY (billId) REFERENCES Bills(id),
      CONSTRAINT BillItems_ibfk_2 FOREIGN KEY (productId) REFERENCES Products(id)
    );
    """

    try:
        with DatabaseConnection.get_connection_ctx() as conn:
            cursor = conn.cursor()
            
            logger.info("Attempting to create 'Bills' table...")
            try:
                cursor.execute(bills_table_sql)
                logger.info("'Bills' table created successfully or already exists.")
            except Exception as e:
                logger.warning(f"Could not create 'Bills' table (it might already exist): {e}")

            logger.info("Attempting to create 'BillItems' table...")
            try:
                cursor.execute(billitems_table_sql)
                logger.info("'BillItems' table created successfully or already exists.")
            except Exception as e:
                logger.warning(f"Could not create 'BillItems' table (it might already exist): {e}")

            conn.commit()
            logger.info("Table creation operations committed.")
    except Exception as e:
        logger.error(f"Error during database connection or table creation: {e}", exc_info=True)

if __name__ == "__main__":
    create_tables()
