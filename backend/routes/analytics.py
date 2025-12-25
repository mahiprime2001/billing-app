"""
Analytics Routes
Flask blueprint for all analytics-related API endpoints
"""

from flask import Blueprint, jsonify, request
import logging
from services import analytics_service

logger = logging.getLogger(__name__)

# Create Blueprint
analytics_bp = Blueprint("analytics", __name__, url_prefix="/api/analytics")

# ============================================
# DASHBOARD ANALYTICS
# ============================================

@analytics_bp.route("/dashboard", methods=["GET"])
def get_dashboard():
    """Get dashboard analytics"""
    try:
        analytics, status_code = analytics_service.get_dashboard_analytics()

        if status_code == 200:
            return jsonify(analytics), 200
        else:
            return jsonify({"error": "Failed to fetch dashboard analytics"}), status_code
    except Exception as e:
        logger.error(f"Error in get_dashboard: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ============================================
# REVENUE ANALYTICS
# ============================================

@analytics_bp.route("/revenue/trends", methods=["GET"])
def get_revenue_trends():
    """Get revenue trends"""
    try:
        days = request.args.get("days", 7, type=int)
        trends, status_code = analytics_service.get_revenue_trends(days)

        if status_code == 200:
            return jsonify(trends), 200
        else:
            return jsonify({"error": "Failed to fetch revenue trends"}), status_code
    except Exception as e:
        logger.error(f"Error in get_revenue_trends: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ============================================
# PRODUCT ANALYTICS
# ============================================

@analytics_bp.route("/products/top", methods=["GET"])
def get_top_products():
    """Get top selling products"""
    try:
        limit = request.args.get("limit", 10, type=int)
        products, status_code = analytics_service.get_top_products(limit)

        if status_code == 200:
            return jsonify(products), 200
        else:
            return jsonify({"error": "Failed to fetch top products"}), status_code
    except Exception as e:
        logger.error(f"Error in get_top_products: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ============================================
# INVENTORY ANALYTICS
# ============================================

@analytics_bp.route("/inventory-health", methods=["GET"])
def get_inventory_health():
    """Get inventory health metrics"""
    try:
        days = request.args.get("days", 30, type=int)
        health, status_code = analytics_service.get_inventory_health()

        if status_code == 200:
            # Format to match frontend expectations
            response = {
                "period": f"Last {days} days",
                "summary": {
                    "totalProducts": health.get("totalProducts", 0),
                    "totalInventoryValue": 0.0,  # TODO: Calculate from products
                    "averageTurnover": 0.0,      # TODO: Calculate turnover ratio
                    "slowMovingCount": health.get("lowStockCount", 0),
                    "outOfStockCount": health.get("outOfStockCount", 0),
                },
                "slowMoving": [],  # TODO: Add slow moving products list
                "outOfStock": [],  # TODO: Add out of stock products list
            }
            return jsonify(response), 200
        else:
            return jsonify({"error": "Failed to fetch inventory health"}), status_code
    except Exception as e:
        logger.error(f"Error in get_inventory_health: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ============================================
# STORE ANALYTICS
# ============================================

@analytics_bp.route("/stores/performance", methods=["GET"])
def get_store_performance():
    """Get store performance metrics"""
    try:
        days = request.args.get("days", 30, type=int)
        performance, status_code = analytics_service.get_store_performance()

        if status_code == 200:
            # Format to match frontend expectations
            response = {
                "data": [
                    {
                        "storeId": store.get("storeId"),
                        "storeName": store.get("storeName"),
                        "revenue": store.get("revenue", 0),
                        "bills": store.get("billCount", 0),
                        "items": 0,             # TODO: Calculate total items
                        "assignedProducts": 0,  # TODO: Get assigned products count
                        "inventoryValue": 0,    # TODO: Calculate inventory value
                        "averageBillValue": store.get("revenue", 0)
                        / max(store.get("billCount", 1), 1),
                        "itemsPerBill": 0,      # TODO: Calculate items per bill
                    }
                    for store in performance
                ]
            }
            return jsonify(response), 200
        else:
            return jsonify({"error": "Failed to fetch store performance"}), status_code
    except Exception as e:
        logger.error(f"Error in get_store_performance: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ============================================
# CATEGORY ANALYTICS
# ============================================

@analytics_bp.route("/category-breakdown", methods=["GET"])
def get_category_breakdown():
    """Get category breakdown"""
    try:
        days = request.args.get("days", 30, type=int)
        # TODO: Implement category breakdown logic
        # For now, return empty data structure
        response = {
            "data": []
        }
        return jsonify(response), 200
    except Exception as e:
        logger.error(f"Error in get_category_breakdown: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ============================================
# ALERTS
# ============================================

@analytics_bp.route("/alerts", methods=["GET"])
def get_alerts():
    """Get system alerts"""
    try:
        # TODO: Implement alerts logic based on inventory, sales, etc.
        response = {
            "alerts": []
        }
        return jsonify(response), 200
    except Exception as e:
        logger.error(f"Error in get_alerts: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ============================================
# USER ANALYTICS
# ============================================

@analytics_bp.route("/users/online", methods=["GET"])
def get_online_users():
    """Get online users count"""
    try:
        # Placeholder for online users
        return jsonify({"count": 0}), 200
    except Exception as e:
        logger.error(f"Error in get_online_users: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/users/sessions", methods=["GET"])
def get_user_sessions():
    """Get user sessions"""
    try:
        # Placeholder for user sessions
        return jsonify([]), 200
    except Exception as e:
        logger.error(f"Error in get_user_sessions: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
