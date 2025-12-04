"""
Flask Backend Application - Main Entry Point
Modular structure with blueprints for better organization
"""
import os
import sys
import logging
from datetime import datetime, timedelta
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

# Import configuration
from config import config

# Import blueprints
from routes.products import products_bp
from routes.customers import customers_bp
from routes.bills import bills_bp
from routes.batches import batches_bp
from routes.returns import returns_bp
from routes.stores import stores_bp
from routes.users import users_bp
from routes.auth import auth_bp
from routes.notifications import notifications_bp
from routes.settings import settings_bp
from routes.printing import printing_bp
from routes.analytics import analytics_bp
from routes.sync import sync_bp
from routes.admin import admin_bp

# Import export script
from scripts.export_data import export_all_data_from_supabase

# Import sync manager
try:
    from scripts.sync_manager import get_sync_manager
    ENHANCED_SYNC_AVAILABLE = True
except ImportError:
    ENHANCED_SYNC_AVAILABLE = False
    print("Enhanced sync manager not available")

# Configure encoding for Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

# Load environment variables
load_dotenv()


def create_app(config_name='default'):
    """Application factory pattern"""
    app = Flask(__name__)
    
    # Load configuration
    app.config.from_object(config[config_name])
    
    # Setup logging
    setup_logging(app)
    
    # Enable CORS
    CORS(
        app,
        resources={r"/api/*": {"origins": app.config['CORS_ORIGINS']}},
        supports_credentials=True,
        methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
    )
    
    # Ensure data directories exist
    ensure_data_directories(app)
    
    # Initialize sync manager
    if ENHANCED_SYNC_AVAILABLE:
        app.sync_manager = get_sync_manager(app.config['BASE_DIR'])
        app.logger.info("Enhanced sync manager initialized")
    else:
        app.sync_manager = None
        app.logger.warning("Running without enhanced sync manager")
    
    # Register blueprints
    app.register_blueprint(products_bp)
    app.register_blueprint(customers_bp)
    app.register_blueprint(bills_bp)
    app.register_blueprint(batches_bp)
    app.register_blueprint(returns_bp)
    app.register_blueprint(stores_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(printing_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(sync_bp)
    app.register_blueprint(admin_bp)
    
    # Register middleware
    @app.before_request
    def log_request_info():
        app.logger.info(
            f"Incoming Request: Method={request.method}, "
            f"Path={request.path}, Origin={request.headers.get('Origin')}"
        )
    
    # Register error handlers
    @app.errorhandler(404)
    def not_found(error):
        app.logger.warning(
            f"404 Not Found: Path={request.path}, "
            f"Method={request.method}, Origin={request.headers.get('Origin')}"
        )
        return jsonify({"status": "error", "message": "Resource not found"}), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        app.logger.error(f"500 Internal Server Error: {error}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500
    
    # Root endpoint
    @app.route('/')
    def home():
        return jsonify({
            "message": "Flask Backend API",
            "version": "2.0",
            "status": "running",
            "sync_available": ENHANCED_SYNC_AVAILABLE
        })
    
    # Health check endpoint
    @app.route('/health')
    def health():
        return jsonify({"status": "healthy", "timestamp": datetime.now().isoformat()})
    
    return app


def setup_logging(app):
    """Configure application logging"""
    log_dir = app.config['LOGS_DIR']
    os.makedirs(log_dir, exist_ok=True)
    
    # Dynamic log file naming with date
    log_file_name = f"app-log-{datetime.now().strftime('%Y-%m-%d')}.log"
    log_file = os.path.join(log_dir, log_file_name)
    
    # Create file handler
    file_handler = logging.FileHandler(log_file, encoding='utf-8')
    file_handler.setLevel(logging.DEBUG)
    
    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s'
    )
    file_handler.setFormatter(formatter)
    
    # Add handler to app logger
    app.logger.addHandler(file_handler)
    app.logger.setLevel(logging.DEBUG)
    
    # Log startup info
    app.logger.info(f"Application started - Log file: {log_file}")
    app.logger.info(f"BASE_DIR: {app.config['BASE_DIR']}")
    app.logger.info(f"JSON_DIR: {app.config['JSON_DIR']}")
    app.logger.info(f"LOGS_DIR: {app.config['LOGS_DIR']}")
    
    # Cleanup old logs
    cleanup_old_log_files(log_dir, app.config['LOG_RETENTION_DAYS'], app.logger)


def ensure_data_directories(app):
    """Ensure data directories exist"""
    dirs_to_check = [
        app.config['DATA_BASE_DIR'],
        app.config['JSON_DIR'],
        app.config['LOGS_DIR']
    ]
    
    for directory in dirs_to_check:
        if not os.path.exists(directory):
            try:
                os.makedirs(directory, exist_ok=True)
                app.logger.info(f"Created directory: {directory}")
            except Exception as e:
                app.logger.error(f"Failed to create directory {directory}: {e}")
        else:
            app.logger.debug(f"Directory already exists: {directory}")


def cleanup_old_log_files(log_directory, days_to_keep, logger):
    """Delete log files older than specified days"""
    logger.info(f"Starting log file cleanup. Keeping files for {days_to_keep} days.")
    cutoff_time = datetime.now() - timedelta(days=days_to_keep)
    deleted_count = 0
    
    for filename in os.listdir(log_directory):
        filepath = os.path.join(log_directory, filename)
        
        if os.path.isfile(filepath) and filename.startswith('app-log-') and filename.endswith('.log'):
            try:
                file_mod_time = datetime.fromtimestamp(os.path.getmtime(filepath))
                if file_mod_time < cutoff_time:
                    os.remove(filepath)
                    logger.info(f"Deleted old log file: {filepath}")
                    deleted_count += 1
            except Exception as e:
                logger.error(f"Error deleting log file {filepath}: {e}")
    
    logger.info(f"Log cleanup completed. Deleted {deleted_count} old log files.")


# Create the application
app = create_app(os.getenv('FLASK_ENV', 'development'))


# Run once on startup to ensure local JSON files are up to date
with app.app_context():
    try:
        export_all_data_from_supabase()
        app.logger.info("Initial data export from Supabase completed successfully.")
    except Exception as e:
        app.logger.error(f"Failed initial data export from Supabase: {e}", exc_info=True)


if __name__ == '__main__':
    # Run the application
    port = int(os.environ.get('PORT', 8080))
    debug = os.environ.get('FLASK_ENV') == 'development'
    debug = True
    
    app.logger.info(f"Starting Flask server on port {port} (debug={debug})")
    app.run(host='0.0.0.0', port=port, debug=debug)
