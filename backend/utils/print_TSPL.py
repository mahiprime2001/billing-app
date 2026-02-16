import win32print
import logging

def generate_tspl(products, copies=1, store_name="Company Name", logger=None):
    if logger is None:
        logger = logging.getLogger(__name__)
        logger.setLevel(logging.INFO)
    
    # ===== DEBUG: Start of print job =====
    logger.info("="*60)
    logger.info("🖨️  STARTING TSPL GENERATION")
    logger.info(f"📦 Products Count: {len(products)}")
    logger.info(f"📄 Copies Requested: {copies}")
    logger.info(f"🏷️  Total Labels to Print: {len(products) * copies}")
    logger.info(f"🏪 Store Name: {store_name}")
    logger.info("="*60)

    tspl = []
    
    # Printer setup - ONCE at the start
    logger.info("⚙️  Adding printer setup commands...")
    tspl.append("GAPDETECT")
    #tspl.append("SIZE 80 mm,12 mm")
    #tspl.append("GAP 3 mm,0 mm")
    tspl.append("DENSITY 10")
    tspl.append("SPEED 4")
    tspl.append("DIRECTION 1")
    tspl.append("REFERENCE 0,0")
    #tspl.append("OFFSET 0, 0")
    tspl.append("SET PEEL OFF")
    tspl.append("SET CUTTER OFF")
    tspl.append("SET TEAR ON")
    logger.info(f"✅ Setup commands added ({len(tspl)} commands)")
    
    # Generate all labels (copies * products)
    label_counter = 0
    
    logger.info(f"\n📝 Generating labels...")
    logger.info(f"Loop structure: {copies} copies × {len(products)} products")
    
    for copy_num in range(copies):
        logger.info(f"\n--- Copy #{copy_num + 1} of {copies} ---")
        
        for product_idx, product in enumerate(products):
            label_counter += 1
            
            logger.info(f"  Label #{label_counter}: Product '{product.get('name', 'Unknown')}' (ID: {product.get('id')})")
            
            tspl.append("CLS")
            
            # Get barcode
            barcode = ""
            barcodes_str = product.get("barcodes")
            if isinstance(barcodes_str, str) and barcodes_str.strip():
                # Split by comma and take the first non-empty barcode
                codes = [b.strip() for b in barcodes_str.split(',') if b.strip()]
                if codes:
                    barcode = codes[0]
            elif product.get("barcode"): # Fallback for old 'barcode' field if it still exists
                barcode = str(product.get("barcode"))
            else:
                barcode = str(product.get("id", "")) # Fallback to product ID
            
            logger.info(f"    🔖 Barcode: {barcode}")
            
            # Barcode
            tspl.append(f'BARCODE 20,0,"128",55,1,0,1,1,"{barcode}"')
            
            # Text elements - Use font size "2" for batch, name, and price (next biggest from current "1")
            tspl.append(f'TEXT 225,30,"1",0,1,1,"{product["name"]}"')
            
            # Batch Information (if available)
            batch_number = product.get('batchNumber', '')
            if batch_number and batch_number.strip():
                logger.info(f"    📦 Batch: {batch_number}")
                tspl.append(f'TEXT 225,6,"1",0,1,1,"{batch_number}"')
                # Adjust price position down if batch is present
                price_y = 54
            else:
                # No batch, price stays at original position
                price_y = 44
            
            # Price - Use font size "2" for better visibility
            # Only use selling_price or sellingPrice, never price
            selling = product.get('selling_price')
            if selling is None or selling == '':
                selling = product.get('sellingPrice')
            if selling is None or selling == '':
                selling = 0
            try:
                selling_val = float(selling)
            except Exception:
                selling_val = 0.0
            logger.info(f"    💰 Selling Price: Rs.{selling_val:.2f}")
            tspl.append(f'TEXT 225,60,"2",0,1,1,"MRP.{selling_val:.2f}"')
            
            # Print ONE label
            tspl.append("PRINT 1")
            logger.info(f"    ✅ Added PRINT 1 command (Label #{label_counter})")
    
    # Feed ONCE at the end
    tspl.append("FEED 0")
    logger.info(f"\n✅ Added FEED 0 command")
    
    total_labels = len(products) * copies
    total_commands = len(tspl)
    
    logger.info("\n" + "="*60)
    logger.info("📊 TSPL GENERATION SUMMARY")
    logger.info(f"Total Labels Generated: {label_counter}")
    logger.info(f"Expected Labels: {total_labels}")
    logger.info(f"Match: {'✅ YES' if label_counter == total_labels else '❌ NO - MISMATCH!'}")
    logger.info(f"Total TSPL Commands: {total_commands}")
    logger.info("="*60)
    
    # Optional: Log the full TSPL command string
    tspl_string = "\n".join(tspl)
    logger.debug(f"\n📄 FULL TSPL COMMANDS:\n{tspl_string}\n")
    
    return tspl_string


def send_raw_to_printer(printer_name, raw_data, logger=None):
    if logger is None:
        logger = logging.getLogger(__name__)
        logger.setLevel(logging.INFO)
    
    logger.info("\n" + "="*60)
    logger.info("🖨️  SENDING TO PRINTER")
    logger.info(f"Printer Name: {printer_name}")
    logger.info(f"Data Size: {len(raw_data)} bytes")
    logger.info("="*60)
    
    # Get available printers
    printers = win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL, None, 1)
    exact_printer_name = None
    available_printer_names = [name for flags, description, name, comment in printers]
    
    logger.info(f"Available Printers: {available_printer_names}")
    
    for name in available_printer_names:
        if name.lower() == printer_name.lower():
            exact_printer_name = name
            break
    
    if not exact_printer_name:
        error_msg = f"❌ Printer '{printer_name}' not found. Available: {available_printer_names}"
        logger.error(error_msg)
        raise ValueError(error_msg)
    
    logger.info(f"✅ Found printer: '{exact_printer_name}'")
    
    handle = win32print.OpenPrinter(exact_printer_name)
    logger.info("✅ Printer handle opened")
    
    try:
        doc_info = ("TSPL Print Job", None, "RAW")
        job_id = win32print.StartDocPrinter(handle, 1, doc_info)
        logger.info(f"✅ Print job started (Job ID: {job_id})")
        
        win32print.StartPagePrinter(handle)
        logger.info("✅ Print page started")
        
        win32print.WritePrinter(handle, raw_data.encode('utf-8'))
        logger.info(f"✅ Data written to printer ({len(raw_data)} bytes)")
        
        win32print.EndPagePrinter(handle)
        logger.info("✅ Print page ended")
        
        win32print.EndDocPrinter(handle)
        logger.info("✅ Print document ended")
        
        logger.info("="*60)
        logger.info("🎉 PRINT JOB COMPLETED SUCCESSFULLY")
        logger.info("="*60)
        return True
        
    except Exception as e:
        logger.error(f"❌ Printing error: {e}", exc_info=True)
        raise
    finally:
        win32print.ClosePrinter(handle)
        logger.info("🔒 Printer handle closed")
