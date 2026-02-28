"""
Bills Service
Handles all bill-related business logic and database operations
"""
import logging
import uuid
from datetime import datetime
from typing import List, Dict, Optional, Tuple

from utils.supabase_db import db
from utils.supabase_resilience import execute_with_retry
from utils.json_helpers import (
    get_bills_data,
    save_bills_data,
    get_discounts_data,
    save_discounts_data,
    get_products_data,
    save_products_data,
    get_store_inventory_data,
)
from utils.json_utils import convert_camel_to_snake, convert_snake_to_camel

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
    Get bills with full item details from Supabase.
    Optimized to fetch only related rows per request.
    """
    try:
        client = db.client

        def normalize_id(value) -> Optional[str]:
            if value is None:
                return None
            text_val = str(value).strip()
            return text_val or None

        def chunked(values: List[str], size: int = 200) -> List[List[str]]:
            return [values[i:i + size] for i in range(0, len(values), size)]

        # Step 1: Fetch bills
        bills_response = execute_with_retry(
            lambda: client.table("bills").select("*"),
            "bills (with details)",
        )
        bills = bills_response.data or []
        if not bills:
            return []

        bill_ids = [normalize_id(bill.get("id")) for bill in bills]
        bill_ids = [bid for bid in bill_ids if bid]

        # Step 2: Fetch bill items only for these bills
        all_items: List[Dict] = []
        if bill_ids:
            for chunk in chunked(bill_ids):
                items_response = execute_with_retry(
                    lambda chunk=chunk: client.table("billitems").select("*").in_("billid", chunk),
                    "billitems by bill ids",
                )
                all_items.extend(items_response.data or [])

        # Step 3: Fetch replacements only for these bills
        replacements: List[Dict] = []
        if bill_ids:
            for chunk in chunked(bill_ids):
                replacements_response = execute_with_retry(
                    lambda chunk=chunk: client.table("replacements").select("*").in_("bill_id", chunk),
                    "replacements by bill ids",
                )
                replacements.extend(replacements_response.data or [])

        # Step 4: Collect product ids from bill items and replacements
        product_ids: List[str] = []
        product_id_set = set()
        for item in all_items:
            product_id = normalize_id(
                item.get("productid") or item.get("product_id") or item.get("productId")
            )
            if product_id and product_id not in product_id_set:
                product_id_set.add(product_id)
                product_ids.append(product_id)

        for replacement in replacements:
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
            for pid in (replaced_product_id, new_product_id):
                if pid and pid not in product_id_set:
                    product_id_set.add(pid)
                    product_ids.append(pid)

        # Step 5: Fetch products only for relevant ids
        product_rows: List[Dict] = []
        if product_ids:
            for chunk in chunked(product_ids):
                products_response = execute_with_retry(
                    lambda chunk=chunk: client.table("products").select("id,name,price,hsn_code_id,hsn_codes(tax)").in_("id", chunk),
                    "products for bills",
                )
                for row in products_response.data or []:
                    hsn_ref = row.get("hsn_codes")
                    if isinstance(hsn_ref, list):
                        hsn_ref = hsn_ref[0] if hsn_ref else None
                    if isinstance(hsn_ref, dict):
                        row["tax"] = hsn_ref.get("tax", 0) or 0
                    else:
                        row["tax"] = row.get("tax", 0) or 0
                    product_rows.append(row)
        if product_ids and not product_rows:
            try:
                local_products = get_products_data()
                for row in local_products:
                    pid = normalize_id(row.get("id"))
                    if not pid or pid not in product_id_set:
                        continue
                    product_rows.append(
                        {
                            "id": row.get("id"),
                            "name": row.get("name"),
                            "price": row.get("price") or row.get("sellingprice") or row.get("selling_price"),
                            "tax": row.get("tax"),
                            "hsn_code_id": row.get("hsn_code_id") or row.get("hsncodeid"),
                        }
                    )
            except Exception as local_products_error:
                logger.warning(f"Failed to load local products fallback: {local_products_error}")

        # Step 6: Build HSN lookup map for relevant products
        hsn_ids: List[str] = []
        hsn_id_set = set()
        for product in product_rows:
            hsn_code_id = product.get("hsn_code_id") or product.get("hsncodeid")
            if hsn_code_id is None:
                continue
            hsn_id = normalize_id(hsn_code_id)
            if hsn_id and hsn_id not in hsn_id_set:
                hsn_id_set.add(hsn_id)
                hsn_ids.append(hsn_id)

        hsn_map: Dict[str, str] = {}
        if hsn_ids:
            for chunk in chunked(hsn_ids):
                hsn_response = execute_with_retry(
                    lambda chunk=chunk: client.table("hsn_codes").select("id,hsn_code").in_("id", chunk),
                    "hsn_codes for bills",
                )
                for code in hsn_response.data or []:
                    code_id = code.get("id")
                    if code_id is None:
                        continue
                    display_code = (
                        code.get("hsn_code")
                        or code.get("hsncode")
                        or str(code_id)
                    )
                    hsn_map[str(code_id)] = str(display_code)

        # Step 7: Build product lookup map
        products_map: Dict[str, Dict] = {}
        for product in product_rows:
            product_id = normalize_id(product.get("id"))
            if not product_id:
                continue
            hsn_code_id = product.get("hsn_code_id") or product.get("hsncodeid")
            hsn_code = hsn_map.get(str(hsn_code_id), str(hsn_code_id)) if hsn_code_id else None
            products_map[product_id] = {
                "name": product.get("name", "Unknown Product"),
                "price": product.get("price", 0),
                "tax": product.get("tax", 0),
                "hsn_code_id": hsn_code_id,
                "hsn_code": hsn_code,
            }

        # Step 8: Build replacements metadata
        replacements_by_bill: Dict[str, Dict] = {}
        replacement_original_by_bill: Dict[str, str] = {}
        replaced_original_bills = set()
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

        # Step 9: Group and enrich bill items
        items_by_bill: Dict[str, List[Dict]] = {}
        for item in all_items:
            bill_id = normalize_id(item.get("billid") or item.get("bill_id") or item.get("billId"))
            product_id = normalize_id(item.get("productid") or item.get("product_id") or item.get("productId"))
            if not bill_id:
                continue

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
            else:
                item["productname"] = "Unknown Product"
                item["productName"] = "Unknown Product"
                item["productId"] = product_id

            items_by_bill.setdefault(bill_id, []).append(item)

        # Step 10: Attach items + replacement metadata to bills
        for bill in bills:
            bill_id = normalize_id(bill.get("id"))
            bill_items = items_by_bill.get(bill_id, [])
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
                resolved_items = replacement_items_as_bill_items
            else:
                resolved_items = bill_items or existing_items or replacement_items_as_bill_items
            bill["items"] = resolved_items

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

        # Ensure discount fields exist; keep backward-compat keys if needed.
        for bill in bills:
            if "discount_percentage" not in bill and "discountpercentage" in bill:
                bill["discount_percentage"] = bill.get("discountpercentage")
            if "discount_amount" not in bill and "discountamount" in bill:
                bill["discount_amount"] = bill.get("discountamount")

            if bill.get("discount_percentage") is None:
                bill["discount_percentage"] = 0
            if bill.get("discount_amount") is None:
                bill["discount_amount"] = 0

        transformed_bills = [convert_snake_to_camel(bill) for bill in bills]
        return transformed_bills

    except Exception as e:
        logger.error(f"Error getting Supabase bills with details: {e}", exc_info=True)
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
        bill_id = bill_data.get("id") or f"inv-{uuid.uuid4().hex[:12]}"
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

        # Aggregate requested quantity by product for stock validation/reduction
        requested_qty_by_product: Dict[str, int] = {}
        for item in items:
            product_id = item.get("product_id") or item.get("productid") or item.get("productId")
            try:
                qty = int(item.get("quantity") or 0)
            except (TypeError, ValueError):
                qty = 0
            if not product_id or qty <= 0:
                continue
            requested_qty_by_product[product_id] = requested_qty_by_product.get(product_id, 0) + qty

        # Local availability check: available = max(0, product.stock - assigned_in_storeinventory)
        if requested_qty_by_product:
            local_products = get_products_data()
            local_inventory = get_store_inventory_data()
            local_product_map = {p.get("id"): p for p in local_products if p.get("id")}
            allocated_by_product: Dict[str, int] = {}
            for row in local_inventory:
                pid = row.get("productid")
                if not pid:
                    continue
                allocated_by_product[pid] = allocated_by_product.get(pid, 0) + int(row.get("quantity") or 0)

            for pid, req_qty in requested_qty_by_product.items():
                product_row = local_product_map.get(pid)
                if not product_row:
                    return None, f"Product {pid} not found", 404
                global_stock = int(product_row.get("stock") or 0)
                allocated = int(allocated_by_product.get(pid, 0))
                available = max(0, global_stock - allocated)
                if req_qty > available:
                    product_name = product_row.get("name", pid)
                    return None, (
                        f"Insufficient available stock for '{product_name}'. "
                        f"Available: {available}, Requested: {req_qty}"
                    ), 400

            # Reduce local product stock and clamp to zero
            for product in local_products:
                pid = product.get("id")
                if pid in requested_qty_by_product:
                    current_stock = int(product.get("stock") or 0)
                    product["stock"] = max(0, current_stock - requested_qty_by_product[pid])
                    product["updatedat"] = datetime.now().isoformat()
            save_products_data(local_products)

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
                execute_with_retry(
                    lambda: client.table("billitems").delete().eq("billid", bill_id),
                    f"billitems reset for bill {bill_id}",
                    retries=2,
                )
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
                    execute_with_retry(
                        lambda: client.table("billitems").insert(bill_items_for_db),
                        f"billitems insert for bill {bill_id}",
                        retries=2,
                    )

            # Reduce Supabase product stock and clamp to zero
            if requested_qty_by_product:
                product_ids = list(requested_qty_by_product.keys())
                products_response = execute_with_retry(
                    lambda: client.table("products").select("id, stock").in_("id", product_ids),
                    f"products stock lookup for bill {bill_id}",
                    retries=2,
                )
                for row in products_response.data or []:
                    pid = row.get("id")
                    if not pid:
                        continue
                    current_stock = int(row.get("stock") or 0)
                    new_stock = max(0, current_stock - int(requested_qty_by_product.get(pid, 0)))
                    execute_with_retry(
                        lambda pid=pid, new_stock=new_stock: client.table("products").update({
                            "stock": new_stock,
                            "updatedat": datetime.now().isoformat(),
                        }).eq("id", pid),
                        f"products stock update {pid} for bill {bill_id}",
                        retries=2,
                    )
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
            # Delete related replacements first (foreign key constraint replacements_bill_fk)
            execute_with_retry(
                lambda: client.table("replacements").delete().eq("bill_id", bill_id),
                f"replacements delete for bill {bill_id}",
                retries=2,
            )

            # Delete related discounts (foreign key constraint discounts_bill_fk)
            related_discount_ids: List[str] = []
            discounts_resp = execute_with_retry(
                lambda: client.table("discounts").select("discount_id").eq("bill_id", bill_id),
                f"discounts lookup for bill {bill_id}",
                retries=2,
            )
            related_discount_ids = [
                d.get("discount_id")
                for d in (discounts_resp.data or [])
                if d.get("discount_id")
            ]

            if related_discount_ids:
                execute_with_retry(
                    lambda: client.table("discounts").delete().in_("discount_id", related_discount_ids),
                    f"discounts delete for bill {bill_id}",
                    retries=2,
                )

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

            execute_with_retry(
                lambda: client.table("billitems").delete().eq("billid", bill_id),
                f"billitems delete for bill {bill_id}",
                retries=2,
            )
            execute_with_retry(
                lambda: client.table("bills").delete().eq("id", bill_id),
                f"bill delete {bill_id}",
                retries=2,
            )
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
