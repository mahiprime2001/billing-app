import json
from datetime import datetime
from decimal import Decimal
import os

def serialize_for_json(obj):
    """
    Recursively converts Decimal objects to float and datetime objects to ISO 8601 strings
    within a dictionary or list for JSON serialization.
    """
    if isinstance(obj, dict):
        return {k: serialize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [serialize_for_json(elem) for elem in obj]
    elif isinstance(obj, Decimal):
        return float(obj)
    elif isinstance(obj, datetime):
        return obj.isoformat()
    return obj

class CustomJsonEncoder(json.JSONEncoder):
    """
    Custom JSON encoder to handle Decimal and datetime objects.
    """
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return json.JSONEncoder.default(self, obj)

def save_json_file(filepath: str, data):
    """
    Saves data to a JSON file, handling Decimal and datetime objects.
    """
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2, cls=CustomJsonEncoder)

def load_json_file(filepath: str):
    """
    Loads data from a JSON file.
    """
    if not os.path.exists(filepath):
        return [] # Or {} depending on expected default
    with open(filepath, 'r') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return [] # Or {}

class AssignedProductManager:
    def __init__(self, filepath="backend/data/json/assigned_products.json"):
        self.filepath = filepath
        self._ensure_file_exists()

    def _ensure_file_exists(self):
        if not os.path.exists(self.filepath):
            save_json_file(self.filepath, [])

    def get_all_assigned_products(self):
        return load_json_file(self.filepath)

    def get_assigned_products_by_store_id(self, store_id: str):
        all_assignments = self.get_all_assigned_products()
        return [assignment for assignment in all_assignments if assignment.get("storeId") == store_id]

    def assign_product_to_store(self, store_id: str, product_id: str):
        all_assignments = self.get_all_assigned_products()
        # Check if this product is already assigned to this store
        if any(a.get("storeId") == store_id and a.get("productId") == product_id for a in all_assignments):
            return False, "Product already assigned to this store."

        # Check if this product is already assigned to any other store
        if any(a.get("productId") == product_id for a in all_assignments):
            return False, "Product already assigned to another store."

        new_assignment = {"storeId": store_id, "productId": product_id}
        all_assignments.append(new_assignment)
        save_json_file(self.filepath, all_assignments)
        return True, "Product assigned successfully."

    def remove_product_from_store(self, store_id: str, product_id: str):
        all_assignments = self.get_all_assigned_products()
        initial_len = len(all_assignments)
        updated_assignments = [
            a for a in all_assignments
            if not (a.get("storeId") == store_id and a.get("productId") == product_id)
        ]
        if len(updated_assignments) < initial_len:
            save_json_file(self.filepath, updated_assignments)
            return True, "Product unassigned successfully."
        return False, "Assignment not found."
