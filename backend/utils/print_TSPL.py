import win32print
import logging

def _format_mm(value):
    if float(value).is_integer():
        return str(int(float(value)))
    return f"{float(value):.2f}".rstrip("0").rstrip(".")

DOTS_PER_MM = 8  # 203 DPI default; adjust if your printer uses a different DPI

def _mm_to_dots(value_mm):
    try:
        return int(round(float(value_mm) * DOTS_PER_MM))
    except Exception:
        return 0

def _estimate_code128_width_dots(data, narrow=1):
    if not data:
        return 0
    # Approximation: 11 modules per symbol, + start + checksum, + stop (13)
    # Add quiet zones (10 modules each side).
    modules = (len(data) + 2) * 11 + 13 + 20
    return modules * max(1, int(narrow))

def generate_tspl(
    products,
    copies=1,
    store_name="Company Name",
    label_size=None,
    label_profile=None,
    logger=None
):
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
    logger.info(f"📐 Label Profile: {label_profile if isinstance(label_profile, dict) else {}}")
    logger.info("="*60)

    tspl = []

    width_mm = 80.0
    height_mm = 12.0
    is_25x25_4up = isinstance(label_profile, dict) and label_profile.get("type") == "25x25_4up"
    profile_columns = 1
    profile_label_w = 0.0
    profile_gap_h = 0.0
    profile_label_w_dots = 0
    if isinstance(label_size, dict):
        try:
            width_value = label_size.get("widthMm", width_mm)
            height_value = label_size.get("heightMm", height_mm)
            width_mm = float(width_value)
            height_mm = float(height_value)
            if width_mm <= 0 or height_mm <= 0:
                raise ValueError
        except Exception:
            logger.warning(
                f"Invalid label_size received ({label_size}), falling back to default 80x12 mm"
            )
            width_mm = 80.0
            height_mm = 12.0
    
    # Printer setup - ONCE at the start
    logger.info("⚙️  Adding printer setup commands...")
    tspl.append("GAPDETECT")
    if is_25x25_4up:
        paper_w = label_profile.get("paper_width_mm")
        paper_h = label_profile.get("paper_height_mm")
        gap_h = label_profile.get("gap_horizontal_mm")
        gap_v = label_profile.get("gap_vertical_mm")

        if paper_w and paper_h:
            tspl.append(f"SIZE {_format_mm(paper_w)} mm,{_format_mm(paper_h)} mm")
        else:
            tspl.append("SIZE ,")

        if gap_h is not None and gap_v is not None:
            tspl.append(f"GAP {_format_mm(gap_h)} mm,{_format_mm(gap_v)} mm")
        else:
            tspl.append("GAP ,")

        try:
            profile_columns = max(1, int(label_profile.get("columns") or 4))
        except Exception:
            profile_columns = 4
        try:
            profile_label_w = float(label_profile.get("label_width_mm") or 25)
        except Exception:
            profile_label_w = 25.0
        try:
            profile_gap_h = float(label_profile.get("gap_horizontal_mm") or 0)
        except Exception:
            profile_gap_h = 0.0
        profile_label_w_dots = _mm_to_dots(profile_label_w)
    else:
        tspl.append(f"SIZE {_format_mm(width_mm)} mm,{_format_mm(height_mm)} mm")
        tspl.append("GAP 4 mm,0 mm")
    tspl.append("DENSITY 10")
    tspl.append("SPEED 2")
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
            
            if is_25x25_4up:
                if label_counter % profile_columns == 1:
                    tspl.append("CLS")  # start new row

                col_index = (label_counter - 1) % profile_columns
                label_pitch_mm = profile_label_w + profile_gap_h
                x_offset = _mm_to_dots(col_index * label_pitch_mm)
                y_offset = 0
            else:
                tspl.append("CLS")
                x_offset = 0
                y_offset = 0
            
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
            if is_25x25_4up:
                barcode_height = 70
                barcode_y = 6
                barcode_width = _estimate_code128_width_dots(barcode, narrow=1)
                barcode_x = x_offset + max(0, (profile_label_w_dots - barcode_width) // 2)
                tspl.append(
                    f'BARCODE {barcode_x},{barcode_y},"128",{barcode_height},1,0,1,1,"{barcode}"'
                )
            else:
                tspl.append(f'BARCODE {20 + x_offset},{0 + y_offset},"128",55,1,0,1,1,"{barcode}"')
            
            # Batch Information (if available)
            batch_number = product.get('batchNumber', '')

            # Text elements - Use font size "2" for batch, name, and price (next biggest from current "1")
            if is_25x25_4up:
                text_left = x_offset + 12
                line_gap = 18
                base_text_y = 90
                # Batch (optional)
                if batch_number and batch_number.strip():
                    tspl.append(f'TEXT {text_left},{base_text_y},"1",0,1,1,"{batch_number}"')
                    name_y = base_text_y + line_gap
                    price_y = name_y + line_gap
                else:
                    name_y = base_text_y
                    price_y = base_text_y + line_gap

                tspl.append(f'TEXT {text_left},{name_y},"1",0,1,1,"{product["name"]}"')
            else:
                tspl.append(f'TEXT {240 + x_offset},{30 + y_offset},"1",0,1,1,"{product["name"]}"')
            
            if not is_25x25_4up:
                if batch_number and batch_number.strip():
                    logger.info(f"    📦 Batch: {batch_number}")
                    tspl.append(f'TEXT {240 + x_offset},{6 + y_offset},"1",0,1,1,"{batch_number}"')
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
            if is_25x25_4up:
                tspl.append(f'TEXT {text_left},{price_y},"1",0,1,1,"Price: {selling_val:.2f}"')
            else:
                tspl.append(f'TEXT {240 + x_offset},{60 + y_offset},"2",0,1,1,"MRP.{selling_val:.2f}"')
            
            # Print ONE label
            if is_25x25_4up:
                if label_counter % profile_columns == 0:
                    tspl.append("PRINT 1")
                    logger.info(f"    ✅ Added PRINT 1 command (Label #{label_counter})")
            else:
                tspl.append("PRINT 1")
                logger.info(f"    ✅ Added PRINT 1 command (Label #{label_counter})")
    
    if is_25x25_4up:
        if label_counter % profile_columns != 0:
            tspl.append("PRINT 1")
            logger.info("    ✅ Added final PRINT 1 command for remaining labels")

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
