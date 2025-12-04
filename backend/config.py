"""
Configuration settings for the Flask backend application
"""
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Config:
    """Base configuration"""
    # Flask settings
    SECRET_KEY = os.environ.get('FLASK_SECRET_KEY', 'super_secret_key_for_dev')
    
    # CORS settings
    CORS_ORIGINS = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5050"
    ]
    
    # Database settings
    SUPABASE_URL = os.environ.get('SUPABASE_URL')
    SUPABASE_KEY = os.environ.get('SUPABASE_KEY')
    
    # MySQL settings (if used)
    MYSQL_HOST = os.environ.get('MYSQL_HOST', 'localhost')
    MYSQL_USER = os.environ.get('MYSQL_USER', 'root')
    MYSQL_PASSWORD = os.environ.get('MYSQL_PASSWORD', '')
    MYSQL_DATABASE = os.environ.get('MYSQL_DATABASE', 'your_database')
    
    # Paths
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DATA_BASE_DIR = os.path.join(BASE_DIR, 'data')
    JSON_DIR = os.path.join(DATA_BASE_DIR, 'json')
    LOGS_DIR = os.path.join(DATA_BASE_DIR, 'logs')
    
    # File paths
    PRODUCTS_FILE = os.path.join(JSON_DIR, 'products.json')
    USERS_FILE = os.path.join(JSON_DIR, 'users.json')
    BILLS_FILE = os.path.join(JSON_DIR, 'bills.json')
    CUSTOMERS_FILE = os.path.join(JSON_DIR, 'customers.json')
    STORES_FILE = os.path.join(JSON_DIR, 'stores.json')
    BATCHES_FILE = os.path.join(JSON_DIR, 'batches.json')
    RETURNS_FILE = os.path.join(JSON_DIR, 'returns.json')
    NOTIFICATIONS_FILE = os.path.join(JSON_DIR, 'notifications.json')
    SETTINGS_FILE = os.path.join(JSON_DIR, 'settings.json')
    SESSIONS_FILE = os.path.join(JSON_DIR, 'user_sessions.json')
    USERSTORES_FILE = os.path.join(JSON_DIR, 'userstores.json')
    STOREINVENTORY_FILE = os.path.join(JSON_DIR, 'storeinventory.json')
    
    # Tauri settings
    TAURI_BASE = os.environ.get('TAURI_HTTP_BASE', 'http://127.0.0.1:5050')
    
    # Printer settings
    PRINTER_NAME = os.environ.get('PRINTER_NAME', 'SNBC TVSE LP46 Dlite BPLE')
    
    # Sync settings
    ENHANCED_SYNC_AVAILABLE = True
    
    # Log settings
    LOG_RETENTION_DAYS = 30

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    TESTING = False

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    TESTING = False

class TestingConfig(Config):
    """Testing configuration"""
    DEBUG = True
    TESTING = True

# Configuration dictionary
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}
