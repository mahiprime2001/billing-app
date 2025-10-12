import win32print
import logging

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

# Run the function
if __name__ == "__main__":
    printer_name = "SNBC TVSE LP46 Dlite BPLE"  # Replace with your printer name from Devices and Printers
    tspl_file_path = "label.tspl"  # Path to your TSPL file
    logger = logging.getLogger(__name__)
    send_tspl_file(printer_name, tspl_file_path, logger)