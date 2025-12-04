"""
Printing Routes
Flask blueprint for all printing-related API endpoints
"""
from flask import Blueprint, jsonify, request
import logging

logger = logging.getLogger(__name__)

# Create Blueprint
printing_bp = Blueprint('printing', __name__, url_prefix='/api')


# ============================================
# PRINTER ENDPOINTS
# ============================================

@printing_bp.route('/printers', methods=['GET'])
def get_printers():
    """Get available printers"""
    try:
        printers = []
        
        # Try to get Windows printers
        try:
            import win32print
            printer_info = win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL)
            printers = [
                {
                    'name': p[2],
                    'isDefault': p[2] == win32print.GetDefaultPrinter()
                }
                for p in printer_info
            ]
        except ImportError:
            logger.warning("win32print not available")
        except Exception as e:
            logger.error(f"Error getting printers: {e}")
        
        return jsonify(printers), 200
            
    except Exception as e:
        logger.error(f"Error in get_printers: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ============================================
# PRINT LABEL ENDPOINT
# ============================================

@printing_bp.route('/print-label', methods=['POST', 'OPTIONS'])
def print_label():
    """Print label"""
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
    
    try:
        data = request.json
        printer_name = data.get('printerName')
        label_data = data.get('labelData', {})
        
        if not printer_name:
            return jsonify({"error": "Printer name is required"}), 400
        
        # Generate TSPL commands
        try:
            from utils.print_TSPL import generate_tspl, send_raw_to_printer
            
            tspl_commands = generate_tspl(label_data)
            
            # Send to printer
            success = send_raw_to_printer(printer_name, tspl_commands)
            
            if success:
                return jsonify({"message": "Label printed successfully"}), 200
            else:
                return jsonify({"error": "Failed to print label"}), 500
                
        except ImportError:
            return jsonify({"error": "Printing module not available"}), 503
        except Exception as e:
            logger.error(f"Error printing label: {e}", exc_info=True)
            return jsonify({"error": str(e)}), 500
            
    except Exception as e:
        logger.error(f"Error in print_label: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
