"""
Printing Routes
Flask blueprint for all printing-related API endpoints

IMPORTANT:
- Tauri is the source of truth
- Backend ONLY prints what it receives
"""

from flask import Blueprint, jsonify, request
import logging

printing_bp = Blueprint("printing", __name__, url_prefix="/api")
logger = logging.getLogger(__name__)


# ============================================================
# GET AVAILABLE PRINTERS (used by Tauri UI)
# ============================================================
@printing_bp.route("/printers", methods=["GET"])
def get_printers():
    try:
        import win32print

        printer_info = win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL)
        printer_names = [p[2] for p in printer_info]

        return jsonify({
            "status": "success",
            "printers": printer_names
        }), 200

    except Exception as e:
        logger.error("Failed to fetch printers", exc_info=True)
        return jsonify({
            "status": "error",
            "message": str(e),
            "printers": []
        }), 500


# ============================================================
# PRINT LABEL (TAURI → BACKEND → PRINTER)
# ============================================================
@printing_bp.route("/print-label", methods=["POST", "OPTIONS"])
def print_label():
    # CORS preflight
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    try:
        data = request.get_json(force=True)

        # ---- REQUIRED FROM TAURI ----
        printer_name = data.get("printerName")
        products = data.get("labelData")
        copies = data.get("copies", 1)
        store_name = data.get("storeName", "Company Name")

        # ---- VALIDATION ----
        if not printer_name:
            return jsonify({"error": "printerName is required"}), 400

        if not isinstance(products, list) or not products:
            return jsonify({"error": "labelData must be a non-empty list"}), 400

        try:
            copies = int(copies)
            if copies <= 0:
                raise ValueError
        except Exception:
            return jsonify({"error": "copies must be a positive integer"}), 400

        logger.info(
            f"PRINT REQUEST → Printer='{printer_name}', "
            f"Products={len(products)}, Copies={copies}, Store='{store_name}'"
        )

        # ---- PRINTING ----
        from utils.print_TSPL import generate_tspl, send_raw_to_printer

        tspl_commands = generate_tspl(
            products=products,
            copies=copies,
            store_name=store_name,
            logger=logger
        )

        send_raw_to_printer(
            printer_name=printer_name,
            raw_data=tspl_commands,
            logger=logger
        )

        # ---- SUCCESS ----
        return jsonify({
            "status": "success",
            "message": "Label printed successfully"
        }), 200

    except Exception as e:
        logger.error("PRINT LABEL FAILED", exc_info=True)
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500
