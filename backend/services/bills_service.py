"""
Bills Service
Handles all bill-related business logic and database operations
"""
import logging
import uuid
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from decimal import Decimal

from utils.supabase_db import db
from utils.json_helpers import get_bills_data, save_bills_data
from utils.json_utils import convert_camel_to_snake, convert_snake_to_camel
from services import products_service

logger = logging.getLogger(__name__)


def get_local_bills() -> List[Dict]:
    """
    Get bills from local JSON storage
    """
    try:
        bills = get_bills_data()
        transformed_bills = [convert_snake_to_camel(bill) for bill in bills]
        logger.debug(f"Returning {len(transformed_bills)} bills from local JSON.")
        return transformed_bills
    except Exception as e:
        logger.error(f"Error getting local bills: {e}", exc_info=True)
        return []


def update_local_bills(bills_data: List[Dict]) -> bool:
    """
    Update local JSON bills with new data
    """
    try:
        if not isinstance(bills_data, list):
            logger.error("Expected a list of bills")
            return False
        
        # Convert from camelCase to snake_case before saving
        snake_case_bills = [convert_camel_to_snake(bill) for bill in bills_data]
        save_bills_data(snake_case_bills)
        logger.info(f"Updated local JSON with {len(bills_data)} bills.")
        return True
    except Exception as e:
        logger.error(f"Error updating local bills: {e}", exc_info=True)
        return False


def get_supabase_bills() -> List[Dict]:
    """
    Get bills directly from Supabase
    """
    try:
        client = db.client
        response = client.table("bills").select("*").execute()
        bills = response.data or []
        transformed_bills = [convert_snake_to_camel(bill) for bill in bills]
        logger.debug(f"Returning {len(transformed_bills)} bills from Supabase.")
        return transformed_bills
    except Exception as e:
        logger.error(f"Error getting Supabase bills: {e}", exc_info=True)
        return []


def get_supabase_bills_with_details() -> List[Dict]:
    """
    Get bills with full item details from Supabase using products service
    """
    try:
        client = db.client
        print("=" * 80)
        print("FETCHING BILLS WITH DETAILS (Using Products Service)")
        print("=" * 80)
        
        # Step 1: Fetch products using the merged products (local + supabase)
        print("\n📦 Step 1: Fetching products via products_service.get_merged_products()...")
        products_list, status_code = products_service.get_merged_products()
        
        if status_code != 200:
            print(f"❌ Failed to fetch products, status code: {status_code}")
            return []
        
        print(f"✅ Fetched {len(products_list)} products from merged products")
        
        # Build product lookup map from products service
        print("\n🗂️ Building product lookup map...")
        products_map = {}
        for product in products_list:
            product_id = product.get("id")
            products_map[product_id] = {
                "name": product.get("name", "Unknown Product"),
                "price": product.get("price", 0)
            }
        print(f"✅ Product map: {len(products_map)} products indexed")
        
        # Show sample products
        if products_map:
            print("\n📋 Sample products:")
            for idx, (pid, pinfo) in enumerate(list(products_map.items())[:3]):
                print(f"  {idx+1}. {pinfo['name']} - ${pinfo['price']}")
        
        # Step 2: Fetch bills
        print("\n📄 Step 2: Fetching bills...")
        bills_response = client.table("bills").select("*").execute()
        bills = bills_response.data or []
        print(f"✅ Fetched {len(bills)} bills")
        
        # Step 3: Fetch bill items (table name: billitems, field: billid, productid)
        print("\n🛒 Step 3: Fetching bill items...")
        items_response = client.table("billitems").select("*").execute()
        all_items = items_response.data or []
        print(f"✅ Fetched {len(all_items)} bill items")
        
        # Group items by bill ID and enrich with product names
        print("\n🔗 Enriching bill items with product names...")
        items_by_bill = {}
        items_enriched = 0
        items_missing_product = 0
        
        for item in all_items:
            # Support multiple column naming styles across deployments
            bill_id = item.get("billid") or item.get("bill_id") or item.get("billId")
            product_id = item.get("productid") or item.get("product_id") or item.get("productId")
            
            if not bill_id:
                continue
            
            # Get product info from products map
            product_info = products_map.get(product_id)
            if product_info:
                item["productname"] = product_info["name"]
                item["productName"] = product_info["name"]
                item["productId"] = product_id
                items_enriched += 1
                if items_enriched <= 5:  # Show first 5 items
                    print(f"  ✓ Item: {product_info['name']} x{item.get('quantity')} = ${item.get('total')}")
            else:
                item["productname"] = "Unknown Product"
                item["productName"] = "Unknown Product"
                item["productId"] = product_id
                items_missing_product += 1
                if product_id:
                    print(f"  ⚠️  Product ID {product_id[:20]}... not found in products map")
            
            # Group by bill
            if bill_id not in items_by_bill:
                items_by_bill[bill_id] = []
            items_by_bill[bill_id].append(item)
        
        print(f"✅ Enriched {items_enriched} items")
        if items_missing_product > 0:
            print(f"⚠️  Missing {items_missing_product} items without product info")
        print(f"📦 Grouped for {len(items_by_bill)} bills")
        
        # Attach items to bills
        print("\n🔗 Attaching items to bills...")
        bills_with_items = 0
        for bill in bills:
            bill_id = bill.get("id")
            bill_items = items_by_bill.get(bill_id, [])
            # If bill already carried inline items, merge them to avoid data loss
            existing_items = bill.get("items") or []
            if existing_items and isinstance(existing_items, str):
                try:
                    import json
                    existing_items = json.loads(existing_items)
                except Exception:
                    existing_items = []
            bill["items"] = bill_items or existing_items
            
            if bill_items:
                bills_with_items += 1
                if bills_with_items <= 3:  # Show first 3 bills
                    print(f"\n  📋 Bill: {bill_id}")
                    print(f"     Customer: {bill.get('customerid', 'N/A')}")
                    print(f"     Total: ${bill.get('total', 0)}")
                    print(f"     Items: {len(bill_items)}")
                    for idx, item in enumerate(bill_items[:3]):
                        print(f"       {idx+1}. {item.get('productname')} x{item.get('quantity')} = ${item.get('total')}")
        
        print(f"✅ {bills_with_items}/{len(bills)} bills have items")
        
        # FIX: Ensure discount fields exist (already in correct format from schema)
        print("\n🔧 Ensuring discount fields exist...")
        for bill in bills:
            # Schema already has: discountpercentage, discountamount (no underscores)
            if 'discountpercentage' not in bill or bill['discountpercentage'] is None:
                bill['discountpercentage'] = 0
            
            if 'discountamount' not in bill or bill['discountamount'] is None:
                bill['discountamount'] = 0
        
        # Convert to camelCase
        print("\n🔄 Converting to camelCase...")
        print("BEFORE conversion - checking first bill's first item:")
        if bills and bills[0].get("items"):
            first_item_before = bills[0]["items"][0]
            print(f"  productname: {first_item_before.get('productname')}")
            print(f"  Keys: {list(first_item_before.keys())}")
        
        transformed_bills = [convert_snake_to_camel(bill) for bill in bills]
        
        # Verification after camelCase
        print("\n✅ Verification after camelCase:")
        if transformed_bills:
            first_bill = transformed_bills[0]
            print(f"  Bill ID: {first_bill.get('id')}")
            print(f"  Total: ${first_bill.get('total')}")
            print(f"  Discount %: {first_bill.get('discountPercentage', 0)}")
            print(f"  Discount Amount: ${first_bill.get('discountAmount', 0)}")
            
            if first_bill.get("items"):
                first_item = first_bill["items"][0]
                print(f"\n  First item ALL keys: {list(first_item.keys())}")
                print(f"  First item details:")
                print(f"    productName: {first_item.get('productName')}")
                print(f"    productId: {first_item.get('productId', 'N/A')[:30] if first_item.get('productId') else 'N/A'}")
                print(f"    quantity: {first_item.get('quantity')}")
                print(f"    price: ${first_item.get('price')}")
                print(f"    total: ${first_item.get('total')}")
        
        print("=" * 80)
        print(f"✅ SUCCESS: Returning {len(transformed_bills)} bills with details")
        print("=" * 80)
        
        return transformed_bills
        
    except Exception as e:
        print(f"❌ ERROR in get_supabase_bills_with_details: {e}")
        logger.error(f"Error getting Supabase bills with details: {e}", exc_info=True)
        import traceback
        traceback.print_exc()
        return []


def get_merged_bills() -> Tuple[List[Dict], int]:
    """
    Get bills by merging local and Supabase (Supabase takes precedence).
    Returns: (bills_list, status_code)
    """
    try:
        # Fetch from Supabase (preferred source)
        supabase_bills = get_supabase_bills()
        
        # Fetch from local JSON (fallback)
        local_bills = get_local_bills()
        
        # Merge (Supabase takes precedence)
        bills_map = {}
        
        # Add local bills first (lower priority)
        for bill in local_bills:
            if bill.get("id"):
                bills_map[bill["id"]] = bill
        
        # Add Supabase bills (higher priority)
        for bill in supabase_bills:
            if bill.get("id"):
                bills_map[bill["id"]] = bill
        
        final_bills = list(bills_map.values())
        final_bills.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
        
        logger.debug(f"Returning {len(final_bills)} merged bills")
        return final_bills, 200
        
    except Exception as e:
        logger.error(f"Error getting merged bills: {e}", exc_info=True)
        return [], 500


def create_bill(bill_data: dict) -> Tuple[Optional[str], str, int]:
    """
    Create a new bill.
    Returns: (bill_id, message, status_code)
    """
    try:
        if not bill_data:
            return None, "No bill data provided", 400
        
        print(f"📝 Creating new bill...")
        
        # Convert field names from camelCase to snake_case for Supabase
        db_bill_data = convert_camel_to_snake(bill_data)
        
        # Generate ID if not present
        if "id" not in db_bill_data:
            db_bill_data["id"] = str(uuid.uuid4())
        
        bill_id = db_bill_data["id"]
        print(f"🆔 Bill ID: {bill_id}")
        
        # Add timestamps
        now_naive = datetime.now().isoformat()
        if "created_at" not in db_bill_data:
            db_bill_data["created_at"] = now_naive
        db_bill_data["updated_at"] = now_naive
        
        # Extract items if present
        items = db_bill_data.pop("items", [])
        print(f"📦 Items: {len(items)}")
        
        # Insert bill into Supabase
        client = db.client
        print(f"💾 Inserting bill...")
        supabase_response = client.table("bills").insert(db_bill_data).execute()
        
        if not supabase_response.data:
            print(f"❌ Failed to insert bill")
            return None, "Failed to insert bill into Supabase", 500
        
        print(f"✅ Bill inserted")
        
        # Insert bill items if present
        if items:
            bill_items_for_db = []
            for idx, item in enumerate(items):
                db_item = {
                    "billid": bill_id,  # Schema field name
                    "productid": item.get("product_id") or item.get("productid"),  # Schema field name
                    "quantity": item.get("quantity"),
                    "price": item.get("price"),
                    "total": item.get("total"),
                }
                
                # Don't set ID, let it auto-increment
                bill_items_for_db.append(db_item)
            
            print(f"📝 Inserting {len(bill_items_for_db)} items...")
            client.table("billitems").insert(bill_items_for_db).execute()
            print(f"✅ Items inserted")
        
        # Save to local JSON
        bills = get_bills_data()
        
        # Add items back to the snake_cased bill data so it is complete
        db_bill_data["items"] = items
        bills.append(db_bill_data)
        save_bills_data(bills)
        print(f"💾 Saved to local JSON")
        
        print(f"✅ Bill created: {bill_id}")
        logger.info(f"Bill created: {bill_id}")
        return bill_id, "Bill created", 201
        
    except Exception as e:
        print(f"❌ Error creating bill: {e}")
        logger.error(f"Error creating bill: {e}", exc_info=True)
        import traceback
        traceback.print_exc()
        return None, str(e), 500


def delete_bill(bill_id: str) -> Tuple[bool, str, int]:
    """
    Delete a bill.
    Returns: (success, message, status_code)
    """
    try:
        print(f"🗑️ Deleting bill: {bill_id}")
        
        # Delete from local JSON
        bills = get_bills_data()
        bill_index = next((i for i, b in enumerate(bills) if b.get("id") == bill_id), -1)
        
        if bill_index != -1:
            bills.pop(bill_index)
            save_bills_data(bills)
            print(f"✅ Deleted from local")
        else:
            print(f"⚠️  Bill not found in local storage")
        
        # Delete from Supabase
        client = db.client
        print(f"🗑️ Deleting from Supabase...")
        
        # Delete bill items first (foreign key constraint)
        client.table("billitems").delete().eq("billid", bill_id).execute()
        
        # Then delete the bill
        client.table("bills").delete().eq("id", bill_id).execute()
        
        print(f"✅ Deleted from Supabase")
        print(f"✅ Bill deleted: {bill_id}")
        logger.info(f"Bill deleted: {bill_id}")
        return True, "Bill deleted", 200
        
    except Exception as e:
        print(f"❌ Error deleting bill: {e}")
        logger.error(f"Error deleting bill: {e}", exc_info=True)
        return False, str(e), 500
