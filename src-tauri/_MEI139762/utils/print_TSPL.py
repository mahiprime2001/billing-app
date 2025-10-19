import win32print
import logging

def generate_tspl(products, copies=1, store_name="Company Name", logger=None):
    if logger is None:
        logger = logging.getLogger(__name__)
        logger.setLevel(logging.INFO)

    tspl = []
    for product in products:
        tspl.append("GAPDETECT")  # Detects gap to align label; comment out if pre-calibrated
        tspl.append("SIZE 80 mm,12 mm")  # Total label size (body + tail)
        tspl.append("GAP 5 mm,0 mm")
        # Gap between labels
        tspl.append("CLS")  # Clear buffer
        tspl.append("DENSITY 10")  # Medium darkness (adjust 0-15 if needed)
        tspl.append("SPEED 4")  # 4 inches/sec (adjust 1-12 for quality)
        tspl.append("DIRECTION 1")  # Inverted for rat-tail tag readability
        tspl.append("REFERENCE 0,0")  # Origin at top-left
        tspl.append("OFFSET 0,-1000")

        barcode = product.get("barcodes", [product.get("id", "")])[0]

        # Barcode: Code 128, positioned at x=8 (1 mm), y=4 (0.5 mm), height=32 dots (4 mm)
        tspl.append(f'BARCODE 20,0,"128",55,1,0,1,1,"{barcode}"')  # Narrower barcode for fit
        # Store name: x=120 (15 mm), y=4 (0.5 mm), font "1", no rotation, 1x scale
        tspl.append(f'TEXT 225,4,"1",0,1,1,"{store_name}"')
        # Product name: x=120, y=24 (3 mm)
        tspl.append(f'TEXT 225,24,"1",0,1,1,"{product["name"]}"')
        # Price: x=120, y=44 (5.5 mm)
        tspl.append(f'TEXT 225,44,"1",0,1,1,"Rs.{product.get("price", 0):.2f}"')

        tspl.append(f"PRINT 1,{copies}")  # Print specified copies
        tspl.append("FEED 0")  # Ensure label advances

    logger.info(f"Generated TSPL commands (copies={copies}, store_name={store_name}):\n{tspl}")
    return "\n".join(tspl)

def send_raw_to_printer(printer_name, raw_data, logger=None):
    """
    Send raw TSPL commands to a printer using Windows Print API.
    :param printer_name: Windows printer name (as in Devices and Printers)
    :param raw_data: str of TSPL commands
    :param logger: Logger instance to use for logging
    """
    if logger is None:
        logger = logging.getLogger(__name__)
        logger.setLevel(logging.INFO)

    logger.info(f"Attempting to send print job to printer: '{printer_name}'")

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