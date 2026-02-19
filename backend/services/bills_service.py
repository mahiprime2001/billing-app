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
from utils.json_helpers import (
    get_bills_data,
    save_bills_data,
    get_discounts_data,
    save_discounts_data,
)
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

        # Required schema fields
        bill_id = bill_data.get("id") or str(uuid.uuid4())
        customer_id = (
            bill_data.get("customerId")
            or bill_data.get("customerid")
            or "CUST-1754821420265"
        )
        store_id = bill_data.get("storeId") or bill_data.get("storeid")
        user_id = bill_data.get("userId") or bill_data.get("userid")
        payment_method = bill_data.get("paymentMethod") or "cash"
        timestamp = bill_data.get("timestamp") or datetime.now().isoformat()
        status = bill_data.get("status") or "completed"
        created_by = bill_data.get("createdBy") or bill_data.get("createdby")

        # Convert numerics to plain floats to avoid JSON serialization errors
        subtotal = float(bill_data.get("subtotal", 0) or 0)
        total = float(bill_data.get("total", 0) or 0)
        discount_amount = float(bill_data.get("discountAmount", 0) or 0)
        discount_percentage = float(bill_data.get("discountPercentage", 0) or 0)

        # Prepare payload strictly matching Supabase schema
        db_bill_data = {
          "id": bill_id,
          "storeid": store_id,
          "customerid": customer_id,
          "userid": user_id,
          "subtotal": subtotal,
          "total": total,
          "paymentmethod": payment_method,
          "timestamp": timestamp,
          "status": status,
          "createdby": created_by,
          "created_at": bill_data.get("created_at") or datetime.now().isoformat(),
          "updated_at": datetime.now().isoformat(),
          "discount_amount": discount_amount,
          "discount_percentage": discount_percentage,
        }

        # Extract items from original bill_data (not snake-cased)
        items = bill_data.get("items", [])
        print(f"📦 Items: {len(items)}")
<<<<<<< HEAD
        
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
                    "productid": item.get("productId") or item.get("product_id") or item.get("productid"),
                    "quantity": item.get("quantity"),
                    "price": float(item.get("price", 0) or 0),
                    "total": float(item.get("total", 0) or 0),
                }
                
                bill_items_for_db.append(db_item)
            
            print(f"📝 Inserting {len(bill_items_for_db)} items...")
            client.table("billitems").insert(bill_items_for_db).execute()
            print(f"✅ Items inserted")
        
        # Save to local JSON (keep richer fields for UI)
        bills = get_bills_data()
        local_bill = convert_camel_to_snake(bill_data)
        local_bill["id"] = bill_id
        local_bill["customerid"] = customer_id
        local_bill["items"] = items
        bills.append(local_bill)
=======

        # Save to local JSON first (offline-first)
        bills = get_bills_data()
        db_bill_data["items"] = items
        existing_idx = next((i for i, b in enumerate(bills) if b.get("id") == bill_id), -1)
        if existing_idx >= 0:
            bills[existing_idx] = db_bill_data
        else:
            bills.append(db_bill_data)
>>>>>>> 2e805f3ee374dcd12af0523e708c844aeb170fd1
        save_bills_data(bills)
        print(f"💾 Saved to local JSON")

        # Best-effort cloud sync now (queued sync will retry if this fails)
        supabase_synced = False
        try:
            client = db.client
            print(f"☁️ Attempting immediate Supabase sync for bill...")
            cloud_bill_data = dict(db_bill_data)
            cloud_bill_data.pop("items", None)
            supabase_response = client.table("bills").upsert(cloud_bill_data).execute()
            supabase_synced = bool(supabase_response.data)

            if items:
                client.table("billitems").delete().eq("billid", bill_id).execute()
                bill_items_for_db = []
                for item in items:
                    bill_items_for_db.append(
                        {
                            "billid": bill_id,
                            "productid": item.get("product_id")
                            or item.get("productid")
                            or item.get("productId"),
                            "quantity": item.get("quantity"),
                            "price": item.get("price"),
                            "total": item.get("total"),
                        }
                    )
                if bill_items_for_db:
                    client.table("billitems").insert(bill_items_for_db).execute()
            if supabase_synced:
                print("✅ Immediate Supabase sync completed for bill")
        except Exception as supabase_error:
            logger.warning(
                f"Bill {bill_id} saved locally; Supabase sync deferred: {supabase_error}"
            )
        
        print(f"✅ Bill created: {bill_id}")
        logger.info(f"Bill created: {bill_id}")
        if supabase_synced:
            return bill_id, "Bill created and synced", 201
        return bill_id, "Bill saved locally and queued for sync", 201
        
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
        
<<<<<<< HEAD
        # Delete from Supabase
        client = db.client
        print(f"🗑️ Deleting from Supabase...")

        # Delete related discounts first (foreign key constraint discounts_bill_fk)
        related_discount_ids: List[str] = []
        try:
            discounts_resp = (
                client.table("discounts")
                .select("discount_id")
                .eq("bill_id", bill_id)
                .execute()
            )
            related_discount_ids = [
                d.get("discount_id")
                for d in (discounts_resp.data or [])
                if d.get("discount_id")
            ]
        except Exception as discount_query_error:
            logger.error(
                f"Error fetching discounts for bill {bill_id}: {discount_query_error}"
            )

        if related_discount_ids:
            try:
                client.table("discounts").delete().in_("discount_id", related_discount_ids).execute()
            except Exception as discount_delete_error:
                logger.error(
                    f"Error deleting discounts for bill {bill_id}: {discount_delete_error}"
                )
                return False, "Unable to delete discounts linked to bill", 500

            # Best-effort local JSON cleanup
            try:
                discounts = get_discounts_data()
                remaining_discounts = [
                    d for d in discounts if d.get("discount_id") not in related_discount_ids
                ]
                save_discounts_data(remaining_discounts)
            except Exception as local_discount_error:
                logger.warning(
                    f"Failed to update local discounts JSON for {bill_id}: {local_discount_error}"
                )

        # Delete bill items next (foreign key constraint)
        client.table("billitems").delete().eq("billid", bill_id).execute()

        # Then delete the bill
        client.table("bills").delete().eq("id", bill_id).execute()
        
        print(f"✅ Deleted from Supabase")
=======
        # Best-effort delete from Supabase (if offline, queue will handle later)
        try:
            client = db.client
            print(f"🗑️ Deleting from Supabase...")
            client.table("billitems").delete().eq("billid", bill_id).execute()
            client.table("bills").delete().eq("id", bill_id).execute()
            print(f"✅ Deleted from Supabase")
        except Exception as supabase_error:
            logger.warning(
                f"Bill {bill_id} deleted locally; Supabase delete deferred: {supabase_error}"
            )
>>>>>>> 2e805f3ee374dcd12af0523e708c844aeb170fd1
        print(f"✅ Bill deleted: {bill_id}")
        logger.info(f"Bill deleted: {bill_id}")
        return True, "Bill deleted", 200
        
    except Exception as e:
        print(f"❌ Error deleting bill: {e}")
        logger.error(f"Error deleting bill: {e}", exc_info=True)
        return False, str(e), 500
