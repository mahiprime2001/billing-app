"""
Services package initialization
"""
# Import all service modules for easy access
from . import products_service
from . import customers_service
from . import bills_service
from . import batches_service
from . import returns_service
from . import stores_service
from . import users_service
from . import notifications_service
from . import settings_service
from . import analytics_service
from . import sync_service

__all__ = [
    'products_service',
    'customers_service',
    'bills_service',
    'batches_service',
    'returns_service',
    'stores_service',
    'users_service',
    'notifications_service',
    'settings_service',
    'analytics_service',
    'sync_service'
]
