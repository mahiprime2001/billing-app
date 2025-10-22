import win32print
import logging
import os
import sys
from datetime import datetime
import uuid # Import uuid for unique IDs

# Resolve project root for imports (supports both development and PyInstaller bundle)
if getattr(sys, "frozen", False):
    PROJECT_ROOT = os.path.dirname(sys._MEIPASS)  # type: ignore
else:
    PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.scripts.sync_manager import EnhancedSyncManager, get_sync_manager # noqa: E402

def send_tspl_file(printer_name, tspl_file_path, logger=None):
    if logger is None:
        logger = logging.getLogger(__name__)
        logger.setLevel(logging.INFO)
        handler = logging.StreamHandler()
        formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    logger.info(f"Attempting to send TSPL file '{tspl_file_path}' to printer: '{printer_name}'")

    # Read the TSPL file
    try:
        with open(tspl_file_path, 'r') as file:
            raw_data = file.read()
    except FileNotFoundError:
        logger.error(f"TSPL file '{tspl_file_path}' not found.")
        raise
    except Exception as e:
        logger.error(f"Error reading TSPL file: {e}")
        raise

    printers = win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL, None, 1)
    exact_printer_name = None
    available_printer_names = [name for flags, description, name, comment in printers]
    for name in available_printer_names:
        if name.lower() == printer_name.lower():
            exact_printer_name = name
            break

    if not exact_printer_name:
        error_msg = f"Printer '{printer_name}' not found or is invalid. Available printers: {available_printer_names}"
        logger.error(error_msg)
        raise ValueError(error_msg)

    logger.info(f"Found exact printer name: '{exact_printer_name}'. Opening printer handle.")
    handle = win32print.OpenPrinter(exact_printer_name)
    try:
        doc_info = ("TSPL Print Job", None, "RAW")
        logger.info(f"Starting print document with job_id: {doc_info}")
        job_id = win32print.StartDocPrinter(handle, 1, doc_info)
        logger.info(f"Print job started with ID: {job_id}")
        win32print.StartPagePrinter(handle)
        logger.info("Starting print page.")
        logger.info(f"Sending raw data: {raw_data}")
        win32print.WritePrinter(handle, raw_data.encode('utf-8'))
        logger.info("Raw data written to printer.")
        win32print.EndPagePrinter(handle)
        logger.info("Ending print page.")
        win32print.EndDocPrinter(handle)
        logger.info("Print document ended successfully.")
    except Exception as e:
        logger.error(f"Error during printing process: {e}", exc_info=True)
        raise
    finally:
        win32print.ClosePrinter(handle)
        logger.info("Printer handle closed.")

# Run the printer function (original test)
if __name__ == "__main__":
    # Configure logging for the test script
    test_logger = logging.getLogger("sync_test_logger")
    if not test_logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
        handler.setFormatter(formatter)
        test_logger.addHandler(handler)
    test_logger.setLevel(logging.INFO)

    manager = get_sync_manager(PROJECT_ROOT)

    # Always add a dummy pending log entry for testing
    unique_id = str(uuid.uuid4())
    dummy_data = {
        "id": unique_id,
        "sync_time": datetime.now().isoformat(),
        "table_name": "Products",
        "change_type": "CREATE",
        "record_id": unique_id,
        "change_data": {"id": unique_id, "name": f"Test Product {unique_id[:8]}", "price": 123.45, "updatedAt": datetime.now().isoformat()},
        "status": "pending",
        "retry_count": 0,
        "last_retry": None,
        "error_message": None,
        "created_at": datetime.now().isoformat()
    }
    manager.log_crud_operation(
        dummy_data["table_name"],
        dummy_data["change_type"],
        dummy_data["record_id"],
        dummy_data["change_data"]
    )
    test_logger.info(f"Dummy entry '{unique_id}' added to local_sync_table.json. Please ensure your MySQL 'Products' table exists and has 'id', 'name', 'price', 'updatedAt' columns.")

    test_logger.info("Manually triggering process_pending_logs()...")
    sync_result = manager.process_pending_logs()
    test_logger.info(f"Manual sync result: {sync_result}")

    # Optional: Printer test (uncomment if needed)
    # printer_name = "SNBC TVSE LP46 Dlite BPLE"  # Replace with your printer name
    # tspl_file_path = "label.tspl"  # Path to your TSPL file
    # try:
    #     send_tspl_file(printer_name, tspl_file_path, test_logger)
    # except Exception as e:
    #     test_logger.error(f"Printer test failed: {e}")
