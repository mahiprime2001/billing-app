"""
Customers Service
Handles all customer-related business logic and database operations
"""
import logging
import uuid
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from collections import defaultdict

from utils.supabase_db import db
from utils.json_helpers import get_customers_data, save_customers_data, get_bills_data
from utils.json_utils import convert_camel_to_snake, convert_snake_to_camel

logger = logging.getLogger(__name__)


# ============================================
# LOCAL JSON OPERATIONS
# ============================================

def get_local_customers() -> List[Dict]:
    """Get customers from local JSON storage"""
    try:
        customers = get_customers_data()
        transformed_customers = [convert_snake_to_camel(customer) for customer in customers]
        logger.debug(f"Returning {len(transformed_customers)} customers from local JSON.")
        return transformed_customers
    except Exception as e:
        logger.error(f"Error getting local customers: {e}", exc_info=True)
        return []


def update_local_customers(customers_data: List[Dict]) -> bool:
    """Update local JSON customers with new data"""
    try:
        if not isinstance(customers_data, list):
            logger.error("Expected a list of customers")
            return False
        
        # Convert from camelCase to snake_case before saving
        snake_case_customers = [convert_camel_to_snake(customer) for customer in customers_data]
        save_customers_data(snake_case_customers)
        
        logger.info(f"Updated local JSON with {len(customers_data)} customers.")
        return True
    except Exception as e:
        logger.error(f"Error updating local customers: {e}", exc_info=True)
        return False


# ============================================
# SUPABASE OPERATIONS
# ============================================

def get_supabase_customers() -> List[Dict]:
    """Get customers directly from Supabase"""
    try:
        client = db.client
        response = client.table("customers").select("*").execute()
        customers = response.data or []
        
        transformed_customers = [convert_snake_to_camel(customer) for customer in customers]
        logger.debug(f"Returning {len(transformed_customers)} customers from Supabase.")
        return transformed_customers
    except Exception as e:
        logger.error(f"Error getting Supabase customers: {e}", exc_info=True)
        return []


# ============================================
# MERGED OPERATIONS
# ============================================

def get_merged_customers() -> Tuple[List[Dict], int]:
    """
    Get customers by merging local and Supabase (Supabase takes precedence).
    Also calculate totalBills and totalSpent for each customer.
    Returns (customers_list, status_code)
    """
    try:
        # Fetch from Supabase (preferred source)
        supabase_customers = get_supabase_customers()
        
        # Fetch from local JSON (fallback)
        local_customers = get_local_customers()
        
        # Merge: Supabase takes precedence
        customers_map = {}
        
        # Add local customers first (lower priority)
        for customer in local_customers:
            if customer.get('id'):
                customers_map[customer['id']] = customer
        
        # Add Supabase customers (higher priority)
        for customer in supabase_customers:
            if customer.get('id'):
                customers_map[customer['id']] = customer
        
        final_customers = list(customers_map.values())
        
        # Calculate bill statistics
        bills = get_bills_data()
        customer_bills_map = defaultdict(lambda: {'totalBills': 0, 'totalSpent': 0.0})
        
        for bill in bills:
            customer_email = bill.get('customer_email')
            customer_phone = bill.get('customer_phone')
            total = float(bill.get('total', 0))
            
            if customer_email:
                customer_bills_map[customer_email]['totalBills'] += 1
                customer_bills_map[customer_email]['totalSpent'] += total
            
            if customer_phone and customer_phone != customer_email:
                customer_bills_map[customer_phone]['totalBills'] += 1
                customer_bills_map[customer_phone]['totalSpent'] += total
        
        # Add statistics to customers
        final_customers_with_stats = []
        for customer in final_customers:
            identifier = customer.get('email') or customer.get('phone')
            if identifier and identifier in customer_bills_map:
                customer['totalBills'] = customer_bills_map[identifier]['totalBills']
                customer['totalSpent'] = round(customer_bills_map[identifier]['totalSpent'], 2)
            else:
                customer['totalBills'] = 0
                customer['totalSpent'] = 0.0
            
            final_customers_with_stats.append(customer)
        
        logger.debug(f"Returning {len(final_customers_with_stats)} merged customers")
        return final_customers_with_stats, 200
        
    except Exception as e:
        logger.error(f"Error getting merged customers: {e}", exc_info=True)
        return [], 500


# ============================================
# BUSINESS LOGIC
# ============================================

def create_customer(customer_data: dict) -> Tuple[Optional[str], str, int]:
    """
    Create a new customer.
    Returns (customer_id, message, status_code)
    """
    try:
        if not customer_data:
            return None, "No customer data provided", 400
        
        # Convert field names
        customer_data = convert_camel_to_snake(customer_data)
        
        # Generate ID if not present
        if 'id' not in customer_data:
            customer_data['id'] = str(uuid.uuid4())
        
        # Add timestamps
        now_naive = datetime.now().isoformat()
        if 'createdat' not in customer_data:
            customer_data['createdat'] = now_naive
        customer_data['updatedat'] = now_naive
        
        # Insert into Supabase
        client = db.client
        supabase_response = client.table('customers').insert(customer_data).execute()
        
        if not supabase_response.data:
            return None, "Failed to insert customer into Supabase", 500
        
        # Save to local JSON
        customers = get_customers_data()
        customers.append(customer_data)
        save_customers_data(customers)
        
        logger.info(f"Customer created {customer_data['id']}")
        return customer_data['id'], "Customer created", 201
        
    except Exception as e:
        logger.error(f"Error creating customer: {e}", exc_info=True)
        return None, str(e), 500


def update_customer(customer_id: str, update_data: dict) -> Tuple[bool, str, int]:
    """
    Update a customer.
    Returns (success, message, status_code)
    """
    try:
        if not update_data:
            return False, "No update data provided", 400
        
        # Convert field names
        update_data = convert_camel_to_snake(update_data)
        
        # Find customer in local storage
        customers = get_customers_data()
        customer_index = next((i for i, c in enumerate(customers) if c.get('id') == customer_id), -1)
        
        if customer_index == -1:
            return False, "Customer not found", 404
        
        # Update timestamp
        update_data['updatedat'] = datetime.now().isoformat()
        
        # Update in local JSON
        customers[customer_index].update(update_data)
        save_customers_data(customers)
        
        # Update in Supabase
        client = db.client
        client.table('customers').update(update_data).eq('id', customer_id).execute()
        
        logger.info(f"Customer updated {customer_id}")
        return True, "Customer updated", 200
        
    except Exception as e:
        logger.error(f"Error updating customer: {e}", exc_info=True)
        return False, str(e), 500
