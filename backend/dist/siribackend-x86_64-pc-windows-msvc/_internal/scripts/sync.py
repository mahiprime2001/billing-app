import os
import sys
import json
import logging
from datetime import datetime

# Add the project root to sys.path for module imports
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from utils.db import DatabaseConnection

# Setup a logger for this script
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
handler = logging.StreamHandler(sys.stdout)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

def _get_table_columns(cursor, table_name):
    """Fetches column names for a given table."""
    cursor.execute(f"DESCRIBE `{table_name}`")
    return [row[0] for row in cursor.fetchall()]

def apply_change_to_db(table_name: str, change_type: str, record_id: str, change_data: dict, logger: logging.Logger):
    """
    Applies a change (CREATE, UPDATE, DELETE) to the respective MySQL table.
    Uses connection context manager to ensure proper connection handling.
    """
    try:
        with DatabaseConnection.get_connection_ctx() as conn:
            cursor = conn.cursor(dictionary=True)
            conn.start_transaction()

            try:
                if change_type == 'DELETE':
                    if table_name == 'Bills':
                        cursor.execute("DELETE FROM `BillItems` WHERE `billId` = %s", (record_id,))
                    elif table_name == 'Products':
                        cursor.execute("DELETE FROM `ProductBarcodes` WHERE `productId` = %s", (record_id,))
                    elif table_name == 'Users':
                        cursor.execute("DELETE FROM `UserStores` WHERE `userId` = %s", (record_id,))
                    
                    cursor.execute(f"DELETE FROM `{table_name}` WHERE `id` = %s", (record_id,))
                    logger.info(f"DELETE - {table_name} - ID: {record_id}")

                elif change_type in ['CREATE', 'UPDATE']:
                    table_columns = _get_table_columns(cursor, table_name)
                    filtered_data = {k: v for k, v in change_data.items() if k in table_columns}

                    if not filtered_data:
                        logger.warning(f"No valid columns found for {table_name} from change_data. Skipping C/U operation.")
                        conn.rollback()
                        return False

                    columns = ', '.join([f"`{key}`" for key in filtered_data.keys()])
                    placeholders = ', '.join(['%s'] * len(filtered_data))
                    update_placeholders = ', '.join([f"`{col}` = %s" for col in filtered_data.keys()])
                    
                    query = f"""
                        INSERT INTO `{table_name}` ({columns}) 
                        VALUES ({placeholders}) 
                        ON DUPLICATE KEY UPDATE {update_placeholders}
                    """
                    values = list(filtered_data.values())
                    cursor.execute(query, values + values)
                    logger.info(f"{change_type} - {table_name} - ID: {record_id}")

                    # Handle related tables
                    if table_name == 'Products' and 'barcodes' in change_data:
                        barcodes = change_data['barcodes']
                        cursor.execute("SELECT `barcode` FROM `ProductBarcodes` WHERE `productId` = %s", (record_id,))
                        existing_barcodes = {row['barcode'] for row in cursor.fetchall()}
                        new_barcodes = set(barcodes)

                        # Add new barcodes
                        for barcode in new_barcodes - existing_barcodes:
                            cursor.execute(
                                "INSERT INTO `ProductBarcodes` (`productId`, `barcode`) VALUES (%s, %s)",
                                (record_id, barcode)
                            )
                            logger.info(f"ADD - ProductBarcode - ProductID: {record_id}, Barcode: {barcode}")
                        
                        # Remove old barcodes
                        for barcode in existing_barcodes - new_barcodes:
                            cursor.execute(
                                "DELETE FROM `ProductBarcodes` WHERE `productId` = %s AND `barcode` = %s",
                                (record_id, barcode)
                            )
                            logger.info(f"REMOVE - ProductBarcode - ProductID: {record_id}, Barcode: {barcode}")

                    elif table_name == 'Users' and 'assignedStores' in change_data:
                        assigned_stores = change_data['assignedStores']
                        cursor.execute("SELECT `storeId` FROM `UserStores` WHERE `userId` = %s", (record_id,))
                        existing_stores = {row['storeId'] for row in cursor.fetchall()}
                        new_stores = set(assigned_stores)

                        # Add new store assignments
                        for store_id in new_stores - existing_stores:
                            cursor.execute(
                                "INSERT INTO `UserStores` (`userId`, `storeId`) VALUES (%s, %s)",
                                (record_id, store_id)
                            )
                            logger.info(f"ADD - UserStore - UserID: {record_id}, StoreID: {store_id}")
                        
                        # Remove old store assignments
                        for store_id in existing_stores - new_stores:
                            cursor.execute(
                                "DELETE FROM `UserStores` WHERE `userId` = %s AND `storeId` = %s",
                                (record_id, store_id)
                            )
                            logger.info(f"REMOVE - UserStore - UserID: {record_id}, StoreID: {store_id}")

                    elif table_name == 'Bills' and 'items' in change_data:
                        # Handle BillItems
                        bill_items = change_data['items']
                        
                        # First, delete all existing items for this bill to handle updates/deletions
                        cursor.execute("DELETE FROM `BillItems` WHERE `billId` = %s", (record_id,))
                        logger.info(f"DELETE ALL - BillItems for BillID: {record_id}")

                        # Then insert the new items
                        for item in bill_items:
                            # Filter item data to only include columns present in BillItems table
                            bill_item_columns = _get_table_columns(cursor, 'BillItems')
                            filtered_item_data = {k: v for k, v in item.items() if k in bill_item_columns}
                            
                            # Ensure billId is set
                            filtered_item_data['billId'] = record_id
                            if 'productId' not in filtered_item_data:
                                logger.warning(f"Bill item missing productId for BillID: {record_id}. Skipping item: {item}")
                                continue

                            item_columns = ', '.join([f"`{key}`" for key in filtered_item_data.keys()])
                            item_placeholders = ', '.join(['%s'] * len(filtered_item_data))
                            
                            item_query = f"INSERT INTO `BillItems` ({item_columns}) VALUES ({item_placeholders})"
                            cursor.execute(item_query, list(filtered_item_data.values()))
                            logger.info(f"ADD - BillItem - BillID: {record_id}, ProductID: {filtered_item_data.get('productId')}")

                # Commit the transaction if we got here without exceptions
                conn.commit()
                return True

            except Exception as e:
                # Rollback on any error
                conn.rollback()
                logger.error(f"Error applying change to DB for {table_name} (ID: {record_id}, Type: {change_type}): {e}")
                return False
                
    except Exception as e:
        logger.error(f"Database connection error in apply_change_to_db: {e}")
        return False

def log_and_apply_sync(table_name: str, change_type: str, record_id: str, change_data: dict, logger: logging.Logger):
    """
    Logs a change into the sync_table and applies it to the respective MySQL table.
    Uses a connection context manager to ensure proper connection handling.
    """
    try:
        with DatabaseConnection.get_connection_ctx() as conn:
            cursor = conn.cursor(dictionary=True)
            conn.start_transaction()

            try:
                # 1. Log to sync_table
                sync_query = """
                    INSERT INTO `sync_table` (`sync_time`, `change_type`, `change_data`)
                    VALUES (%s, %s, %s)
                """
                sync_params = (datetime.now(), change_type, json.dumps(change_data))
                cursor.execute(sync_query, sync_params)
                logger.info(f"Logged to sync_table: {table_name} - {change_type} - {record_id}")
                
                # 2. Apply the change using the same connection
                if apply_change_to_db(table_name, change_type, record_id, change_data, logger):
                    conn.commit()
                    return True
                else:
                    conn.rollback()
                    return False
                    
            except Exception as e:
                conn.rollback()
                logger.error(f"Error in transaction for {table_name} (ID: {record_id}, Type: {change_type}): {e}")
                return False
                
    except Exception as e:
        logger.error(f"Database connection error in log_and_apply_sync: {e}")
        return False


if __name__ == "__main__":
    # Example usage
    # Ensure you have a running MySQL instance and the database/tables are set up
    # from app/data/mysql/database.schema

    # Test Product CREATE/UPDATE
    sample_product_create = {
        "id": "prod-123",
        "name": "Test Product",
        "price": 99.99,
        "stock": 100,
        "tax": 5.0,
        "createdAt": datetime.now().isoformat(),
        "updatedAt": datetime.now().isoformat(),
        "barcodes": ["BC123", "BC456"]
    }
    log_and_apply_sync("Products", "CREATE", "prod-123", sample_product_create, logger)
    print("Sample product CREATE/UPDATE log entry created and applied.")

    sample_product_update = {
        "id": "prod-123",
        "name": "Updated Test Product",
        "price": 109.99,
        "stock": 90,
        "tax": 6.0,
        "updatedAt": datetime.now().isoformat(),
        "barcodes": ["BC123", "BC789"] # Change barcode
    }
    log_and_apply_sync("Products", "UPDATE", "prod-123", sample_product_update, logger)
    print("Sample product UPDATE log entry created and applied.")

    # Test User CREATE/UPDATE
    sample_user_create = {
        "id": "user-456",
        "name": "Test User",
        "email": "test@example.com",
        "password": "hashed_password",
        "role": "admin",
        "status": "active",
        "createdAt": datetime.now().isoformat(),
        "updatedAt": datetime.now().isoformat(),
        "assignedStores": ["STR-001", "STR-002"]
    }
    log_and_apply_sync("Users", "CREATE", "user-456", sample_user_create, logger)
    print("Sample user CREATE/UPDATE log entry created and applied.")

    sample_user_update = {
        "id": "user-456",
        "name": "Updated User",
        "email": "updated@example.com",
        "role": "staff",
        "updatedAt": datetime.now().isoformat(),
        "assignedStores": ["STR-001"] # Change assigned stores
    }
    log_and_apply_sync("Users", "UPDATE", "user-456", sample_user_update, logger)
    print("Sample user UPDATE log entry created and applied.")

    # Test Store CREATE/UPDATE
    sample_store_create = {
        "id": "STR-001",
        "name": "Main Store",
        "address": "123 Main St",
        "phone": "123-456-7890",
        "status": "active",
        "createdAt": datetime.now().isoformat(),
        "updatedAt": datetime.now().isoformat()
    }
    log_and_apply_sync("Stores", "CREATE", "STR-001", sample_store_create, logger)
    print("Sample store CREATE/UPDATE log entry created and applied.")

    # Test Bill CREATE (requires existing user and store)
    sample_bill_create = {
        "id": "bill-789",
        "storeId": "STR-001",
        "storeName": "Main Store",
        "customerName": "John Doe",
        "subtotal": 100.00,
        "total": 105.00,
        "paymentMethod": "Cash",
        "timestamp": datetime.now().isoformat(),
        "createdBy": "user-456",
        "items": [
            {"productId": "prod-123", "productName": "Test Product", "quantity": 1, "price": 99.99, "total": 99.99, "tax": 5.0, "gstRate": 5.0}
        ]
    }
    log_and_apply_sync("Bills", "CREATE", "bill-789", sample_bill_create, logger)
    print("Sample bill CREATE log entry created and applied.")

    # Test Product DELETE
    log_and_apply_sync("Products", "DELETE", "prod-123", {}, logger)
    print("Sample product DELETE log entry created and applied.")

    # Test Bill DELETE
    log_and_apply_sync("Bills", "DELETE", "bill-789", {}, logger)
    print("Sample bill DELETE log entry created and applied.")

    # Test User DELETE
    log_and_apply_sync("Users", "DELETE", "user-456", {}, logger)
    print("Sample user DELETE log entry created and applied.")

    # Test Store DELETE
    log_and_apply_sync("Stores", "DELETE", "STR-001", {}, logger)
    print("Sample store DELETE log entry created and applied.")
