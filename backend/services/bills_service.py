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
from utils.supabase_resilience import execute_with_retry
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
        response = execute_with_retry(
            lambda: client.table("bills").select("*"),
            "bills",
        )
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
        
        def normalize_id(value) -> Optional[str]:
            if value is None:
                return None
            text = str(value).strip()
            return text or None

        # Step 1: Fetch products using the merged products (local + supabase)
        print("\n📦 Step 1: Fetching products via products_service.get_merged_products()...")
        products_list, status_code = products_service.get_merged_products()
        if status_code != 200:
            print(f"⚠️ Failed to fetch products, status code: {status_code}. Continuing with empty product map.")
            products_list = []
        
        print(f"✅ Fetched {len(products_list)} products from merged products")
        
        # Build HSN lookup map: id -> readable HSN code
        hsn_map = {}
        try:
            hsn_response = execute_with_retry(
                lambda: client.table("hsn_codes").select("*"),
                "hsn_codes",
            )
            for code in hsn_response.data or []:
                code_id = code.get("id")
                if code_id is None:
                    continue
                display_code = (
                    code.get("hsn_code")
                    or code.get("hsncode")
                    or code.get("code")
                    or str(code_id)
                )
                hsn_map[str(code_id)] = str(display_code)
        except Exception as hsn_error:
            logger.warning(f"Failed to load HSN codes for bill enrichment: {hsn_error}")

        # Build product lookup map from products service
        print("\n🗂️ Building product lookup map...")
        products_map = {}
        for product in products_list:
            product_id = normalize_id(product.get("id"))
            if not product_id:
                continue
            hsn_code_id = (
                product.get("hsnCode")
                or product.get("hsnCodeId")
                or product.get("hsn_code_id")
            )
            hsn_code = hsn_map.get(str(hsn_code_id), str(hsn_code_id)) if hsn_code_id else None
            products_map[product_id] = {
                "name": product.get("name", "Unknown Product"),
                "price": product.get("price", 0),
                "tax": product.get("tax", 0),
                "hsn_code_id": hsn_code_id,
                "hsn_code": hsn_code,
            }
        print(f"✅ Product map: {len(products_map)} products indexed")
        
        # Show sample products
        if products_map:
            print("\n📋 Sample products:")
            for idx, (pid, pinfo) in enumerate(list(products_map.items())[:3]):
                print(f"  {idx+1}. {pinfo['name']} - ${pinfo['price']}")
        
        # Step 2: Fetch bills
        print("\n📄 Step 2: Fetching bills...")
        bills_response = execute_with_retry(
            lambda: client.table("bills").select("*"),
            "bills (with details)",
        )
        bills = bills_response.data or []
        print(f"✅ Fetched {len(bills)} bills")
        
        # Step 2.5: Fetch replacements metadata (if table exists) to tag replacement bills
        print("\n🔁 Step 2.5: Fetching replacements...")
        replacements_by_bill = {}
        replacement_original_by_bill = {}
        replaced_original_bills = set()
        try:
            replacements_response = execute_with_retry(
                lambda: client.table("replacements").select("*"),
                "replacements",
            )
            replacements = replacements_response.data or []
            print(f"✅ Fetched {len(replacements)} replacement rows")

            for replacement in replacements:
                bill_id = normalize_id(
                    replacement.get("bill_id")
                    or replacement.get("billid")
                    or replacement.get("billId")
                )
                original_bill_id = normalize_id(
                    replacement.get("original_bill_id")
                    or replacement.get("originalbillid")
                    or replacement.get("originalBillId")
                )

                if original_bill_id:
                    replaced_original_bills.add(original_bill_id)

                if not bill_id:
                    continue

                if bill_id not in replacements_by_bill:
                    replacements_by_bill[bill_id] = {
                        "rows": 0,
                        "quantity": 0,
                        "final_amount": 0.0,
                        "replacement_items": [],
                    }

                replacement_stats = replacements_by_bill[bill_id]
                replaced_product_id = normalize_id(
                    replacement.get("replaced_product_id")
                    or replacement.get("replacedproductid")
                    or replacement.get("replacedProductId")
                )
                new_product_id = normalize_id(
                    replacement.get("new_product_id")
                    or replacement.get("newproductid")
                    or replacement.get("newProductId")
                )
                try:
                    quantity = int(replacement.get("quantity") or 0)
                except (TypeError, ValueError):
                    quantity = 0
                try:
                    price = float(replacement.get("price") or 0)
                except (TypeError, ValueError):
                    price = 0.0
                try:
                    final_amount = float(replacement.get("final_amount") or 0)
                except (TypeError, ValueError):
                    final_amount = 0.0
                line_total = final_amount if final_amount > 0 else (price * quantity)

                replaced_product_name = products_map.get(replaced_product_id, {}).get(
                    "name", "Unknown Product"
                )
                new_product_name = products_map.get(new_product_id, {}).get(
                    "name", "Unknown Product"
                )

                replacement_stats["rows"] += 1
                replacement_stats["quantity"] += quantity
                replacement_stats["final_amount"] += line_total
                replacement_stats["replacement_items"].append(
                    {
                        "id": replacement.get("id"),
                        "replaced_product_id": replaced_product_id,
                        "replaced_product_name": replaced_product_name,
                        "new_product_id": new_product_id,
                        "new_product_name": new_product_name,
                        "quantity": quantity,
                        "price": price,
                        "final_amount": line_total,
                        "damage_reason": replacement.get("damage_reason") or replacement.get("reason"),
                    }
                )

                if original_bill_id and bill_id not in replacement_original_by_bill:
                    replacement_original_by_bill[bill_id] = original_bill_id
        except Exception as replacements_error:
            logger.warning(f"Failed to load replacements for bill enrichment: {replacements_error}")
            print(f"⚠️ Could not fetch replacements: {replacements_error}")

        # Step 3: Fetch bill items (table name: billitems, field: billid, productid)
        print("\n🛒 Step 3: Fetching bill items...")
        items_response = execute_with_retry(
            lambda: client.table("billitems").select("*"),
            "billitems",
        )
        all_items = items_response.data or []
        print(f"✅ Fetched {len(all_items)} bill items")
        
        # Group items by bill ID and enrich with product names
        print("\n🔗 Enriching bill items with product names...")
        items_by_bill = {}
        items_enriched = 0
        items_missing_product = 0
        
        for item in all_items:
            # Support multiple column naming styles across deployments
            bill_id = normalize_id(item.get("billid") or item.get("bill_id") or item.get("billId"))
            product_id = normalize_id(item.get("productid") or item.get("product_id") or item.get("productId"))
            
            if not bill_id:
                continue
            
            # Get product info from products map
            product_info = products_map.get(product_id)
            if product_info:
                item["productname"] = product_info["name"]
                item["productName"] = product_info["name"]
                item["productId"] = product_id
                item["tax"] = product_info.get("tax", 0)
                if product_info.get("hsn_code_id") is not None:
                    item["hsn_code_id"] = product_info.get("hsn_code_id")
                    item["hsnCodeId"] = product_info.get("hsn_code_id")
                if product_info.get("hsn_code"):
                    item["hsn_code"] = product_info.get("hsn_code")
                    item["hsnCode"] = product_info.get("hsn_code")
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
            bill_id = normalize_id(bill.get("id"))
            bill_items = items_by_bill.get(bill_id, [])
            # If bill already carried inline items, merge them to avoid data loss
            existing_items = bill.get("items") or []
            if existing_items and isinstance(existing_items, str):
                try:
                    import json
                    existing_items = json.loads(existing_items)
                except Exception:
                    existing_items = []
            replacement_stats = replacements_by_bill.get(bill_id)

            replacement_items_as_bill_items = []
            if replacement_stats:
                for replacement_item in replacement_stats.get("replacement_items", []):
                    line_total = float(
                        replacement_item.get("final_amount")
                        or (
                            float(replacement_item.get("price") or 0)
                            * int(replacement_item.get("quantity") or 0)
                        )
                    )
                    replacement_items_as_bill_items.append(
                        {
                            "productid": replacement_item.get("new_product_id"),
                            "productId": replacement_item.get("new_product_id"),
                            "productname": replacement_item.get("new_product_name"),
                            "productName": replacement_item.get("new_product_name"),
                            "quantity": int(replacement_item.get("quantity") or 0),
                            "price": float(replacement_item.get("price") or 0),
                            "total": line_total,
                            "is_replacement_item": True,
                            "isReplacementItem": True,
                            "replaced_product_id": replacement_item.get("replaced_product_id"),
                            "replacedProductId": replacement_item.get("replaced_product_id"),
                            "replaced_product_name": replacement_item.get("replaced_product_name"),
                            "replacedProductName": replacement_item.get("replaced_product_name"),
                            "final_amount": replacement_item.get("final_amount"),
                            "finalAmount": replacement_item.get("final_amount"),
                        }
                    )

            if replacement_stats and replacement_items_as_bill_items:
                # Replacement bills should show replacement item lines, not original billitems rows.
                resolved_items = replacement_items_as_bill_items
            else:
                resolved_items = bill_items or existing_items or replacement_items_as_bill_items
            bill["items"] = resolved_items
            
            if bill_items:
                bills_with_items += 1
                if bills_with_items <= 3:  # Show first 3 bills
                    print(f"\n  📋 Bill: {bill_id}")
                    print(f"     Customer: {bill.get('customerid', 'N/A')}")
                    print(f"     Total: ${bill.get('total', 0)}")
                    print(f"     Items: {len(bill_items)}")
                    for idx, item in enumerate(bill_items[:3]):
                        print(f"       {idx+1}. {item.get('productname')} x{item.get('quantity')} = ${item.get('total')}")

            bill["is_replacement"] = bool(replacement_stats)
            bill["isReplacement"] = bool(replacement_stats)
            bill["replacement_items_count"] = replacement_stats["rows"] if replacement_stats else 0
            bill["replacementItemsCount"] = replacement_stats["rows"] if replacement_stats else 0
            bill["replacement_quantity"] = replacement_stats["quantity"] if replacement_stats else 0
            bill["replacementQuantity"] = replacement_stats["quantity"] if replacement_stats else 0
            bill["replacement_final_amount"] = (
                round(replacement_stats["final_amount"], 2) if replacement_stats else 0
            )
            bill["replacementFinalAmount"] = (
                round(replacement_stats["final_amount"], 2) if replacement_stats else 0
            )
            bill["replacement_original_bill_id"] = replacement_original_by_bill.get(bill_id)
            bill["replacementOriginalBillId"] = replacement_original_by_bill.get(bill_id)
            bill["has_been_replaced"] = bill_id in replaced_original_bills if bill_id else False
            bill["hasBeenReplaced"] = bill_id in replaced_original_bills if bill_id else False
            bill["replacement_items"] = (
                replacement_stats.get("replacement_items", []) if replacement_stats else []
            )
            bill["replacementItems"] = (
                replacement_stats.get("replacement_items", []) if replacement_stats else []
            )

            if replacement_stats:
                replacement_total = round(float(replacement_stats.get("final_amount") or 0), 2)
                if replacement_total > 0:
                    existing_total = bill.get("total")
                    try:
                        existing_total_num = float(existing_total or 0)
                    except (TypeError, ValueError):
                        existing_total_num = 0.0
                    if existing_total_num <= 0:
                        bill["total"] = replacement_total

                existing_subtotal = bill.get("subtotal")
                try:
                    existing_subtotal_num = float(existing_subtotal or 0)
                except (TypeError, ValueError):
                    existing_subtotal_num = 0.0

                if existing_subtotal_num <= 0:
                    computed_subtotal = round(
                        sum(float(item.get("total") or 0) for item in resolved_items), 2
                    )
                    if computed_subtotal > 0:
                        bill["subtotal"] = computed_subtotal
        
        print(f"✅ {bills_with_items}/{len(bills)} bills have items")
        
        # Ensure schema discount fields exist; keep backward-compat keys if needed.
        print("\n🔧 Ensuring discount fields exist...")
        for bill in bills:
            # Supabase schema uses: discount_percentage, discount_amount.
            if 'discount_percentage' not in bill and 'discountpercentage' in bill:
                bill['discount_percentage'] = bill.get('discountpercentage')
            if 'discount_amount' not in bill and 'discountamount' in bill:
                bill['discount_amount'] = bill.get('discountamount')

            if bill.get('discount_percentage') is None:
                bill['discount_percentage'] = 0
            if bill.get('discount_amount') is None:
                bill['discount_amount'] = 0
        
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
        # Save to local JSON first (offline-first)
        bills = get_bills_data()
        db_bill_data["items"] = items
        existing_idx = next((i for i, b in enumerate(bills) if b.get("id") == bill_id), -1)
        if existing_idx >= 0:
            bills[existing_idx] = db_bill_data
        else:
            bills.append(db_bill_data)
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
        
        # Best-effort delete from Supabase (if offline, queue will handle later)
        try:
            client = db.client
            print(f"🗑️ Deleting from Supabase...")
            # Delete related discounts first (foreign key constraint discounts_bill_fk)
            related_discount_ids: List[str] = []
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

            if related_discount_ids:
                client.table("discounts").delete().in_("discount_id", related_discount_ids).execute()

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

            client.table("billitems").delete().eq("billid", bill_id).execute()
            client.table("bills").delete().eq("id", bill_id).execute()
            print(f"✅ Deleted from Supabase")
        except Exception as supabase_error:
            logger.warning(
                f"Bill {bill_id} deleted locally; Supabase delete deferred: {supabase_error}"
            )
        print(f"✅ Bill deleted: {bill_id}")
        logger.info(f"Bill deleted: {bill_id}")
        return True, "Bill deleted", 200
        
    except Exception as e:
        print(f"❌ Error deleting bill: {e}")
        logger.error(f"Error deleting bill: {e}", exc_info=True)
        return False, str(e), 500
