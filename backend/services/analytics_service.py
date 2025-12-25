"""
Analytics Service
Handles all analytics and reporting business logic
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
from collections import defaultdict

from utils.json_helpers import (
    get_bills_data, get_products_data, 
    get_stores_data, get_store_inventory_data,
    get_users_data
)

logger = logging.getLogger(__name__)


# ============================================
# DASHBOARD ANALYTICS
# ============================================

def get_dashboard_analytics() -> Tuple[Dict, int]:
    """
    Get dashboard analytics summary.
    Returns (analytics_dict, status_code)
    """
    try:
        bills = get_bills_data()
        products = get_products_data()
        stores = get_stores_data()
        
        # Calculate totals
        total_revenue = sum(float(bill.get('total', 0)) for bill in bills)
        total_bills = len(bills)
        total_products = len(products)
        total_stores = len(stores)
        
        # Get top products
        top_products, _ = get_top_products(limit=5)
        
        # Get active users
        active_users, _ = get_active_users()
        
        # Calculate today's revenue
        today = datetime.now().date().isoformat()
        today_revenue = sum(
            float(bill.get('total', 0)) 
            for bill in bills 
            if bill.get('createdat', '').startswith(today)
        )
        
        analytics = {
            'totalRevenue': round(total_revenue, 2),
            'totalBills': total_bills,
            'totalProducts': total_products,
            'totalStores': total_stores,
            'todayRevenue': round(today_revenue, 2),
            'topProducts': top_products,
            'activeUsers': active_users.get('activeUsers', 0)
        }
        
        return analytics, 200
        
    except Exception as e:
        logger.error(f"Error getting dashboard analytics: {e}", exc_info=True)
        return {}, 500


# ============================================
# REVENUE TRENDS
# ============================================

def get_revenue_trends(days: int = 7) -> Tuple[List[Dict], int]:
    """
    Get revenue trends for the last N days.
    Returns (trends_list, status_code)
    """
    try:
        bills = get_bills_data()
        
        # Calculate date range
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days)
        
        # Group bills by date
        daily_revenue = defaultdict(float)
        
        for bill in bills:
            bill_date_str = bill.get('createdat', '')
            if bill_date_str:
                bill_date = datetime.fromisoformat(bill_date_str).date()
                if start_date <= bill_date <= end_date:
                    daily_revenue[bill_date.isoformat()] += float(bill.get('total', 0))
        
        # Format as list
        trends = [
            {'date': date, 'revenue': round(revenue, 2)}
            for date, revenue in sorted(daily_revenue.items())
        ]
        
        return trends, 200
        
    except Exception as e:
        logger.error(f"Error getting revenue trends: {e}", exc_info=True)
        return [], 500


# ============================================
# TOP PRODUCTS
# ============================================

def get_top_products(limit: int = 10) -> Tuple[List[Dict], int]:
    """
    Get top selling products.
    Returns (products_list, status_code)
    """
    try:
        bills = get_bills_data()
        
        # Count product sales
        product_sales = defaultdict(lambda: {'quantity': 0, 'revenue': 0.0})
        
        for bill in bills:
            items = bill.get('items', [])
            for item in items:
                product_id = item.get('product_id')
                quantity = item.get('quantity', 0)
                price = float(item.get('price', 0))
                
                if product_id:
                    product_sales[product_id]['quantity'] += quantity
                    product_sales[product_id]['revenue'] += price * quantity
        
        # Get product details
        products = get_products_data()
        products_map = {p.get('id'): p for p in products}
        
        # Format results
        top_products = []
        for product_id, sales in product_sales.items():
            product = products_map.get(product_id, {})
            top_products.append({
                'productId': product_id,
                'productName': product.get('name', 'Unknown'),
                'quantitySold': sales['quantity'],
                'revenue': round(sales['revenue'], 2)
            })
        
        # Sort by quantity sold
        top_products.sort(key=lambda x: x['quantitySold'], reverse=True)
        
        return top_products[:limit], 200
        
    except Exception as e:
        logger.error(f"Error getting top products: {e}", exc_info=True)
        return [], 500


# ============================================
# INVENTORY HEALTH
# ============================================

def get_inventory_health() -> Tuple[Dict, int]:
    """
    Get inventory health metrics.
    Returns (health_dict, status_code)
    """
    try:
        products = get_products_data()
        inventory = get_store_inventory_data()
        
        low_stock_count = 0
        out_of_stock_count = 0
        
        for product in products:
            stock = int(product.get('stock', 0))
            min_stock = int(product.get('min_stock', 10))
            
            if stock == 0:
                out_of_stock_count += 1
            elif stock <= min_stock:
                low_stock_count += 1
        
        health = {
            'lowStockCount': low_stock_count,
            'outOfStockCount': out_of_stock_count,
            'totalProducts': len(products),
            'healthyStockCount': len(products) - low_stock_count - out_of_stock_count
        }
        
        return health, 200
        
    except Exception as e:
        logger.error(f"Error getting inventory health: {e}", exc_info=True)
        return {}, 500


# ============================================
# STORE PERFORMANCE
# ============================================

def get_store_performance() -> Tuple[List[Dict], int]:
    """
    Get performance metrics for all stores.
    Returns (performance_list, status_code)
    """
    try:
        bills = get_bills_data()
        stores = get_stores_data()
        
        # Group bills by store
        store_revenue = defaultdict(lambda: {'billCount': 0, 'revenue': 0.0})
        
        for bill in bills:
            store_id = bill.get('store_id')
            if store_id:
                store_revenue[store_id]['billCount'] += 1
                store_revenue[store_id]['revenue'] += float(bill.get('total', 0))
        
        # Format results
        performance = []
        for store in stores:
            store_id = store.get('id')
            stats = store_revenue.get(store_id, {'billCount': 0, 'revenue': 0.0})
            
            performance.append({
                'storeId': store_id,
                'storeName': store.get('name', 'Unknown'),
                'billCount': stats['billCount'],
                'revenue': round(stats['revenue'], 2)
            })
        
        # Sort by revenue
        performance.sort(key=lambda x: x['revenue'], reverse=True)
        
        return performance, 200
        
    except Exception as e:
        logger.error(f"Error getting store performance: {e}", exc_info=True)
        return [], 500
# ============================================
# USER ANALYTICS
# ============================================

def get_active_users() -> Tuple[Dict, int]:
    """
    Get active user count.
    Returns (active_users_dict, status_code)
    """
    try:
        users = get_users_data()
        active_users = sum(1 for user in users if user.get('is_active'))
        
        return {'activeUsers': active_users}, 200
        
    except Exception as e:
        logger.error(f"Error getting active users: {e}", exc_info=True)
        return {}, 500