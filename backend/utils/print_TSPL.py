# print_TSPL.py

import win32print
import logging

def generate_tspl(products, copies=1, store_name="Company Name", logger=None):
    if logger is None:
        logger = logging.getLogger(__name__)
        logger.setLevel(logging.INFO)

    tspl = []
    for product in products:
        tspl.append("SIZE 55 mm,12 mm")   # Correct size
        tspl.append("GAP 8 mm,0 mm")
        tspl.append("CLS")
        tspl.append("DIRECTION 1") # Changed from 2 to 1 for standard TSPL inverted direction
        tspl.append("REFERENCE 0,0")

        barcode = product.get("barcodes", [product.get("id", "")])[0]

        # Barcode on left
        # x=40 dots (5mm), y=2 dots (0.25mm), height=40 dots (5mm)
        tspl.append(f'BARCODE 40,2,"128",48,1,0,1,2,"{barcode}"')

        # Barcode number (below barcode) - uncommented and adjusted
        # x=40 dots (aligned with barcode), y=45 dots (below barcode)

        # Product info section (right side of the label)
        # x=250 dots (31.25mm from left edge of label)
        tspl.append(f'TEXT 230,5,"1",0,1,1,"SIRI ART JEWELLERS"')
        tspl.append(f'TEXT 230,20,"1",0,1,1,"Product:{product["name"]}"') # Corrected "Prodcut" to "Product"
        tspl.append(f'TEXT 230,35,"1",0,1,1,"Price:Rs.{product.get("price", 0):.2f}"') # Changed ₹ to Rs.

        tspl.append(f"PRINT 1,{copies}")
    
    logger.info(f"Generated TSPL commands (copies={copies}, store_name={store_name}):\n{tspl}")
    return "\n".join(tspl) # Moved return statement outside the loop

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

    # Enumerate printers to find the exact name recognized by the system
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
