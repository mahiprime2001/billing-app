"""
Routes package initialization
"""
# Import all blueprints for easy access
from .products import products_bp
from .customers import customers_bp
from .bills import bills_bp
from .batches import batches_bp
from .returns import returns_bp
from .discounts import discounts_bp
from .stores import stores_bp
from .users import users_bp
from .auth import auth_bp
from .notifications import notifications_bp
from .settings import settings_bp
from .printing import printing_bp
from .analytics import analytics_bp
from .sync import sync_bp
from .admin import admin_bp

__all__ = [
    'products_bp',
    'customers_bp',
    'bills_bp',
    'batches_bp',
    'returns_bp',
    'discounts_bp',
    'stores_bp',
    'users_bp',
    'auth_bp',
    'notifications_bp',
    'settings_bp',
    'printing_bp',
    'analytics_bp',
    'sync_bp',
    'admin_bp'
]
