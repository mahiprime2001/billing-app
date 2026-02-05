"""
Supabase Database Manager
Replacement for MySQL db.py connection
"""
from supabase import create_client, Client
from dotenv import load_dotenv
import os
import sys
from typing import Optional, List, Dict, Any
import logging

logger = logging.getLogger(__name__)

# ✅ FIX: Handle both development and PyInstaller bundled modes
def get_env_path():
    """Get the correct .env file path for both dev and production"""
    if getattr(sys, 'frozen', False):
        # Running as PyInstaller bundle
        # The bundled executable runs from a temp directory
        # We need to look in the directory where the executable is located
        if hasattr(sys, '_MEIPASS'):
            # PyInstaller's temp extraction folder
            bundle_dir = sys._MEIPASS
            env_path = os.path.join(bundle_dir, '.env')
            
            # If .env doesn't exist in bundle, try executable's parent directory
            if not os.path.exists(env_path):
                exe_dir = os.path.dirname(sys.executable)
                env_path = os.path.join(exe_dir, '.env')
            
            logger.info(f"🔍 [BUNDLED MODE] Looking for .env at: {env_path}")
        else:
            # Fallback: next to executable
            exe_dir = os.path.dirname(sys.executable)
            env_path = os.path.join(exe_dir, '.env')
            logger.info(f"🔍 [FROZEN MODE] Looking for .env at: {env_path}")
    else:
        # Running in normal Python (development mode)
        # Look in backend/ directory
        current_dir = os.path.dirname(os.path.abspath(__file__))
        backend_dir = os.path.dirname(current_dir)  # Go up one level from utils/
        env_path = os.path.join(backend_dir, '.env')
        logger.info(f"🔍 [DEV MODE] Looking for .env at: {env_path}")
    
    return env_path

# Load environment variables
env_file_path = get_env_path()
load_dotenv(env_file_path)

# Log if .env was found
if os.path.exists(env_file_path):
    logger.info(f"✅ .env file found at: {env_file_path}")
else:
    logger.warning(f"⚠️ .env file NOT found at: {env_file_path}")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error(f"❌ Environment variables not loaded from: {env_file_path}")
    logger.error(f"   Current working directory: {os.getcwd()}")
    logger.error(f"   Executable location: {sys.executable if hasattr(sys, 'executable') else 'N/A'}")
    raise ValueError(f"❌ SUPABASE_URL and SUPABASE_KEY must be set in .env file. Checked: {env_file_path}")

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    logger.info("✅ Supabase client initialized successfully")
except Exception as e:
    logger.error(f"❌ Failed to initialize Supabase client: {e}")
    raise

class SupabaseDB:
    """
    Supabase database manager for all tables
    Provides CRUD operations for the billing system
    """
    
    def __init__(self):
        self.client = supabase
    
    # ==========================================
    # STORES
    # ==========================================
    
    def get_stores(self) -> List[Dict]:
        """Get all stores"""
        try:
            response = self.client.table("stores").select("*").execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting stores: {e}")
            return []
    
    def get_store(self, store_id: str) -> Optional[Dict]:
        """Get store by ID"""
        try:
            response = self.client.table("stores").select("*").eq("id", store_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error getting store {store_id}: {e}")
            return None
    
    def create_store(self, store_data: Dict) -> Optional[Dict]:
        """Create new store"""
        try:
            response = self.client.table("stores").insert(store_data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error creating store: {e}")
            return None
    
    def update_store(self, store_id: str, store_data: Dict) -> Optional[Dict]:
        """Update store"""
        try:
            response = self.client.table("stores").update(store_data).eq("id", store_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error updating store {store_id}: {e}")
            return None
    
    def delete_store(self, store_id: str) -> bool:
        """Delete store"""
        try:
            self.client.table("stores").delete().eq("id", store_id).execute()
            return True
        except Exception as e:
            logger.error(f"Error deleting store {store_id}: {e}")
            return False
    
    # ==========================================
    # PRODUCTS
    # ==========================================
    
    def get_products(self, store_id: Optional[str] = None) -> List[Dict]:
        """Get all products or filter by store"""
        try:
            query = self.client.table("products").select("*")
            if store_id:
                query = query.eq("assignedstoreid", store_id)
            response = query.execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting products: {e}")
            return []
    
    def get_product(self, product_id: str) -> Optional[Dict]:
        """Get product by ID"""
        try:
            response = self.client.table("products").select("*").eq("id", product_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error getting product {product_id}: {e}")
            return None
    
    def create_product(self, product_data: Dict) -> Optional[Dict]:
        """Create new product"""
        try:
            response = self.client.table("products").insert(product_data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error creating product: {e}")
            return None
    
    def update_product(self, product_id: str, product_data: Dict) -> Optional[Dict]:
        """Update product"""
        try:
            response = self.client.table("products").update(product_data).eq("id", product_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error updating product {product_id}: {e}")
            return None
    
    def delete_product(self, product_id: str) -> bool:
        """Delete product"""
        try:
            self.client.table("products").delete().eq("id", product_id).execute()
            return True
        except Exception as e:
            logger.error(f"Error deleting product {product_id}: {e}")
            return False
    
    def update_product_stock(self, product_id: str, new_stock: int) -> Optional[Dict]:
        """Update product stock"""
        return self.update_product(product_id, {"stock": new_stock})
    
    def reduce_product_stock(self, product_id: str, quantity: int) -> Optional[Dict]:
        """Reduce product stock by quantity"""
        product = self.get_product(product_id)
        if product:
            new_stock = max(0, product.get("stock", 0) - quantity)
            return self.update_product_stock(product_id, new_stock)
        return None
    
    def get_product_by_barcode(self, barcode: str) -> Optional[Dict]:
        """Find product by barcode in the 'barcodes' text field"""
        try:
            # Assuming 'barcodes' column stores a comma-separated string of barcodes
            # Use 'ilike' for case-insensitive partial match
            response = self.client.table("products").select("*").ilike("barcodes", f"%{barcode}%").execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error finding product by barcode {barcode}: {e}")
            return None
    
    # ==========================================
    # CUSTOMERS
    # ==========================================
    
    def get_customers(self) -> List[Dict]:
        """Get all customers"""
        try:
            response = self.client.table("customers").select("*").execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting customers: {e}")
            return []
    
    def get_customer(self, customer_id: str) -> Optional[Dict]:
        """Get customer by ID"""
        try:
            response = self.client.table("customers").select("*").eq("id", customer_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error getting customer {customer_id}: {e}")
            return None
    
    def get_customer_by_phone(self, phone: str) -> Optional[Dict]:
        """Get customer by phone number"""
        try:
            response = self.client.table("customers").select("*").eq("phone", phone).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error getting customer by phone {phone}: {e}")
            return None
    
    def get_customer_by_email(self, email: str) -> Optional[Dict]:
        """Get customer by email"""
        try:
            response = self.client.table("customers").select("*").eq("email", email).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error getting customer by email {email}: {e}")
            return None
    
    def create_customer(self, customer_data: Dict) -> Optional[Dict]:
        """Create new customer"""
        try:
            response = self.client.table("customers").insert(customer_data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error creating customer: {e}")
            return None
    
    def update_customer(self, customer_id: str, customer_data: Dict) -> Optional[Dict]:
        """Update customer"""
        try:
            response = self.client.table("customers").update(customer_data).eq("id", customer_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error updating customer {customer_id}: {e}")
            return None
    
    def delete_customer(self, customer_id: str) -> bool:
        """Delete customer"""
        try:
            self.client.table("customers").delete().eq("id", customer_id).execute()
            return True
        except Exception as e:
            logger.error(f"Error deleting customer {customer_id}: {e}")
            return False
    
    # ==========================================
    # USERS
    # ==========================================
    
    def get_users(self) -> List[Dict]:
        """Get all users"""
        try:
            response = self.client.table("users").select("*").execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting users: {e}")
            return []
    
    def get_user(self, user_id: str) -> Optional[Dict]:
        """Get user by ID"""
        try:
            response = self.client.table("users").select("*").eq("id", user_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error getting user {user_id}: {e}")
            return None
    
    def get_user_by_email(self, email: str) -> Optional[Dict]:
        """Get user by email"""
        try:
            response = self.client.table("users").select("*").eq("email", email).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error getting user by email {email}: {e}")
            return None
    
    def create_user(self, user_data: Dict) -> Optional[Dict]:
        """Create new user"""
        try:
            response = self.client.table("users").insert(user_data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error creating user: {e}")
            return None
    
    def update_user(self, user_id: str, user_data: Dict) -> Optional[Dict]:
        """Update user"""
        try:
            response = self.client.table("users").update(user_data).eq("id", user_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error updating user {user_id}: {e}")
            return None
    
    def delete_user(self, user_id: str) -> bool:
        """Delete user"""
        try:
            self.client.table("users").delete().eq("id", user_id).execute()
            return True
        except Exception as e:
            logger.error(f"Error deleting user {user_id}: {e}")
            return False
    
    # ==========================================
    # USER STORES (Many-to-Many)
    # ==========================================
    
    def get_user_stores(self, user_id: str) -> List[str]:
        """Get all store IDs assigned to a user"""
        try:
            response = self.client.table("userstores").select("storeid").eq("userid", user_id).execute()
            return [row["storeid"] for row in response.data] if response.data else []
        except Exception as e:
            logger.error(f"Error getting stores for user {user_id}: {e}")
            return []
    
    def get_store_users(self, store_id: str) -> List[str]:
        """Get all user IDs assigned to a store"""
        try:
            response = self.client.table("userstores").select("userid").eq("storeid", store_id).execute()
            return [row["userid"] for row in response.data] if response.data else []
        except Exception as e:
            logger.error(f"Error getting users for store {store_id}: {e}")
            return []
    
    def add_user_store(self, user_id: str, store_id: str) -> Optional[Dict]:
        """Assign store to user"""
        try:
            response = self.client.table("userstores").insert({
                "userid": user_id,
                "storeid": store_id
            }).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error adding store {store_id} to user {user_id}: {e}")
            return None
    
    def remove_user_store(self, user_id: str, store_id: str) -> bool:
        """Remove store from user"""
        try:
            self.client.table("userstores").delete().eq("userid", user_id).eq("storeid", store_id).execute()
            return True
        except Exception as e:
            logger.error(f"Error removing store {store_id} from user {user_id}: {e}")
            return False
    
    # ==========================================
    # BILLS
    # ==========================================
    
    def get_bills(self, store_id: Optional[str] = None, limit: int = 100, offset: int = 0) -> List[Dict]:
        """Get bills with optional store filter"""
        try:
            query = self.client.table("bills").select("*").limit(limit).offset(offset).order("timestamp", desc=True)
            if store_id:
                query = query.eq("storeid", store_id)
            response = query.execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting bills: {e}")
            return []
    
    def get_bill(self, bill_id: str) -> Optional[Dict]:
        """Get bill by ID"""
        try:
            response = self.client.table("bills").select("*").eq("id", bill_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error getting bill {bill_id}: {e}")
            return None
    
    def create_bill(self, bill_data: Dict) -> Optional[Dict]:
        """Create new bill"""
        try:
            response = self.client.table("bills").insert(bill_data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error creating bill: {e}")
            return None
    
    def update_bill(self, bill_id: str, bill_data: Dict) -> Optional[Dict]:
        """Update bill"""
        try:
            response = self.client.table("bills").update(bill_data).eq("id", bill_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error updating bill {bill_id}: {e}")
            return None
    
    def delete_bill(self, bill_id: str) -> bool:
        """Delete bill"""
        try:
            self.client.table("bills").delete().eq("id", bill_id).execute()
            return True
        except Exception as e:
            logger.error(f"Error deleting bill {bill_id}: {e}")
            return False
    
    def get_bills_by_date_range(self, start_date: str, end_date: str, store_id: Optional[str] = None) -> List[Dict]:
        """Get bills within date range"""
        try:
            query = self.client.table("bills").select("*").gte("timestamp", start_date).lte("timestamp", end_date)
            if store_id:
                query = query.eq("storeid", store_id)
            response = query.execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting bills by date range: {e}")
            return []
    
    def get_bills_by_customer(self, customer_id: str, limit: int = 50) -> List[Dict]:
        """Get bills for a specific customer"""
        try:
            response = self.client.table("bills").select("*").eq("customerid", customer_id).limit(limit).order("timestamp", desc=True).execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting bills for customer {customer_id}: {e}")
            return []
    
    # ==========================================
    # BILL ITEMS
    # ==========================================
    
    def get_bill_items(self, bill_id: str) -> List[Dict]:
        """Get all items for a bill"""
        try:
            response = self.client.table("billitems").select("*").eq("billid", bill_id).execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting bill items for {bill_id}: {e}")
            return []
    
    def create_bill_item(self, item_data: Dict) -> Optional[Dict]:
        """Create single bill item"""
        try:
            response = self.client.table("billitems").insert(item_data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error creating bill item: {e}")
            return None
    
    def create_bill_items_batch(self, items: List[Dict]) -> List[Dict]:
        """Create multiple bill items at once"""
        try:
            response = self.client.table("billitems").insert(items).execute()
            return response.data if response.data else []
        except Exception as e:
            logger.error(f"Error creating bill items batch: {e}")
            return []
    
    # ==========================================
    # BATCH
    # ==========================================
    
    def get_batches(self) -> List[Dict]:
        """Get all batches"""
        try:
            response = self.client.table("batch").select("*").execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting batches: {e}")
            return []
    
    def get_batch(self, batch_id: str) -> Optional[Dict]:
        """Get batch by ID"""
        try:
            response = self.client.table("batch").select("*").eq("id", batch_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error getting batch {batch_id}: {e}")
            return None
    
    def create_batch(self, batch_data: Dict) -> Optional[Dict]:
        """Create new batch"""
        try:
            response = self.client.table("batch").insert(batch_data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error creating batch: {e}")
            return None
    
    def update_batch(self, batch_id: str, batch_data: Dict) -> Optional[Dict]:
        """Update batch"""
        try:
            response = self.client.table("batch").update(batch_data).eq("id", batch_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error updating batch {batch_id}: {e}")
            return None
    
    def delete_batch(self, batch_id: str) -> bool:
        """Delete batch"""
        try:
            self.client.table("batch").delete().eq("id", batch_id).execute()
            return True
        except Exception as e:
            logger.error(f"Error deleting batch {batch_id}: {e}")
            return False
    
    # ==========================================
    # RETURNS
    # ==========================================
    
    def get_returns(self, status: Optional[str] = None, limit: int = 100) -> List[Dict]:
        """Get returns with optional status filter"""
        try:
            query = self.client.table("returns").select("*").order("created_at", desc=True).limit(limit)
            if status:
                query = query.eq("status", status)
            response = query.execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting returns: {e}")
            return []
    
    def get_return(self, return_id: str) -> Optional[Dict]:
        """Get return by ID"""
        try:
            response = self.client.table("returns").select("*").eq("return_id", return_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error getting return {return_id}: {e}")
            return None
    
    def create_return(self, return_data: Dict) -> Optional[Dict]:
        """Create new return"""
        try:
            response = self.client.table("returns").insert(return_data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error creating return: {e}")
            return None
    
    def update_return(self, return_id: str, return_data: Dict) -> Optional[Dict]:
        """Update return"""
        try:
            response = self.client.table("returns").update(return_data).eq("return_id", return_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error updating return {return_id}: {e}")
            return None
    
    def update_return_status(self, return_id: str, status: str) -> Optional[Dict]:
        """Update return status"""
        return self.update_return(return_id, {"status": status})
    
    # ==========================================
    # DISCOUNTS
    # ==========================================
    
    def get_discounts(self, status: Optional[str] = None, limit: int = 100) -> List[Dict]:
        """Get discounts with optional status filter"""
        try:
            query = self.client.table("discounts").select("*").order("created_at", desc=True).limit(limit)
            if status:
                query = query.eq("status", status)
            response = query.execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting discounts: {e}")
            return []
    
    def get_discount(self, discount_id: str) -> Optional[Dict]:
        """Get discount by ID"""
        try:
            response = self.client.table("discounts").select("*").eq("discount_id", discount_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error getting discount {discount_id}: {e}")
            return None
    
    def create_discount(self, discount_data: Dict) -> Optional[Dict]:
        """Create new discount"""
        try:
            response = self.client.table("discounts").insert(discount_data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error creating discount: {e}")
            return None
    
    def update_discount(self, discount_id: str, discount_data: Dict) -> Optional[Dict]:
        """Update discount"""
        try:
            response = (
                self.client.table("discounts")
                .update(discount_data)
                .eq("discount_id", discount_id)
                .execute()
            )
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error updating discount {discount_id}: {e}")
            return None
    
    def update_discount_status(self, discount_id: str, status: str) -> Optional[Dict]:
        """Update discount status"""
        return self.update_discount(discount_id, {"status": status})
    
    # ==========================================
    # NOTIFICATIONS
    # ==========================================
    
    def get_notifications(self, is_read: Optional[bool] = None, limit: int = 50) -> List[Dict]:
        """Get notifications"""
        try:
            query = self.client.table("notifications").select("*").order("created_at", desc=True).limit(limit)
            if is_read is not None:
                query = query.eq("is_read", is_read)
            response = query.execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting notifications: {e}")
            return []
    
    def get_unread_notifications(self, limit: int = 50) -> List[Dict]:
        """Get unread notifications"""
        return self.get_notifications(is_read=False, limit=limit)
    
    def create_notification(self, notification_data: Dict) -> Optional[Dict]:
        """Create notification"""
        try:
            response = self.client.table("notifications").insert(notification_data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error creating notification: {e}")
            return None
    
    def mark_notification_read(self, notification_id: int) -> Optional[Dict]:
        """Mark notification as read"""
        try:
            response = self.client.table("notifications").update({"is_read": True}).eq("id", notification_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error marking notification {notification_id} as read: {e}")
            return None
    
    def mark_all_notifications_read(self) -> bool:
        """Mark all notifications as read"""
        try:
            self.client.table("notifications").update({"is_read": True}).eq("is_read", False).execute()
            return True
        except Exception as e:
            logger.error(f"Error marking all notifications as read: {e}")
            return False
    
    # ==========================================
    # SYSTEM SETTINGS
    # ==========================================
    
    def get_system_settings(self) -> Optional[Dict]:
        """Get system settings"""
        try:
            response = self.client.table("systemsettings").select("*").limit(1).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error getting system settings: {e}")
            return None
    
    def update_system_settings(self, settings_data: Dict) -> Optional[Dict]:
        """Update system settings"""
        try:
            existing = self.get_system_settings()
            if existing:
                response = self.client.table("systemsettings").update(settings_data).eq("id", existing["id"]).execute()
            else:
                response = self.client.table("systemsettings").insert(settings_data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error updating system settings: {e}")
            return None
    
    # ==========================================
    # APP CONFIG
    # ==========================================
    
    def get_app_config(self, config_key: str) -> Optional[str]:
        """Get app configuration value by key"""
        try:
            response = self.client.table("app_config").select("config_value").eq("config_key", config_key).execute()
            return response.data[0]["config_value"] if response.data else None
        except Exception as e:
            logger.error(f"Error getting app config {config_key}: {e}")
            return None
    
    def set_app_config(self, config_key: str, config_value: str) -> Optional[Dict]:
        """Set or update app configuration"""
        try:
            existing = self.client.table("app_config").select("*").eq("config_key", config_key).execute()
            if existing.data:
                response = self.client.table("app_config").update({"config_value": config_value}).eq("config_key", config_key).execute()
            else:
                response = self.client.table("app_config").insert({"config_key": config_key, "config_value": config_value}).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error setting app config {config_key}: {e}")
            return None
    
    # ==========================================
    # SYNC TABLE
    # ==========================================
    
    def get_pending_syncs(self, limit: int = 100) -> List[Dict]:
        """Get pending sync operations"""
        try:
            response = self.client.table("sync_table").select("*").eq("status", "pending").limit(limit).order("created_at").execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting pending syncs: {e}")
            return []
    
    def create_sync_record(self, sync_data: Dict) -> Optional[Dict]:
        """Create sync record"""
        try:
            response = self.client.table("sync_table").insert(sync_data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error creating sync record: {e}")
            return None
    
    def update_sync_status(self, sync_id: int, status: str, synced_at: Optional[str] = None) -> Optional[Dict]:
        """Update sync record status"""
        try:
            update_data = {"status": status}
            if synced_at:
                update_data["synced_at"] = synced_at
            response = self.client.table("sync_table").update(update_data).eq("id", sync_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error updating sync status {sync_id}: {e}")
            return None


# Global database instance
db = SupabaseDB()

# Convenience functions for quick access
def get_db() -> SupabaseDB:
    """Get database instance"""
    return db
