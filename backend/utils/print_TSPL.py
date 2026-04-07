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

    # Detect 25x25 4-up profile
    is_25x25_4up = (
        isinstance(label_profile, dict) and label_profile.get("type") == "25x25_4up"
    ) or (
        isinstance(label_size, dict)
        and abs(float(label_size.get("widthMm", 0)) - 25.0) < 0.5
        and abs(float(label_size.get("heightMm", 0)) - 25.0) < 0.5
    )

    # ── Printer setup ────────────────────────────────────────────
    logger.info("⚙️  Adding printer setup commands...")
    if is_25x25_4up:
        # TVS LP 36 Dlite calibrated setup for 25x25 4-up stock
        tspl.append("SIZE 100 mm,25 mm")
        tspl.append("GAP 2 mm,0 mm")
        tspl.append("DENSITY 10")
        tspl.append("SPEED 2")
        tspl.append("DIRECTION 1")
        tspl.append("REFERENCE 8,0")
        tspl.append("CLS")
    else:
        width_mm = 80.0
        height_mm = 12.0
        if isinstance(label_size, dict):
            try:
                w = float(label_size.get("widthMm", width_mm))
                h = float(label_size.get("heightMm", height_mm))
                if w > 0 and h > 0:
                    width_mm, height_mm = w, h
            except Exception:
                pass
        tspl.append(f"SIZE {_format_mm(width_mm)} mm,{_format_mm(height_mm)} mm")
        tspl.append("GAP 4 mm,0 mm")
        tspl.append("DENSITY 10")
        tspl.append("SPEED 2")
        tspl.append("DIRECTION 1")
        tspl.append("REFERENCE 0,0")
        tspl.append("SET PEEL OFF")
        tspl.append("SET CUTTER OFF")
        tspl.append("SET TEAR ON")

    logger.info(f"✅ Setup commands added ({len(tspl)} commands)")

    # ── Label constants for 25x25 4-up ───────────────────────────
    # Column X positions calibrated for 203 DPI on 100mm paper
    COLUMN_X = [8, 208, 408, 608]
    barcode_height = 50
    barcode_y = 5
    text_offset_y = barcode_y + barcode_height + 6   # 61
    line_h = 14

    # ── Generate labels ──────────────────────────────────────────
    label_counter = 0
    logger.info(f"\n📝 Generating labels...")
    logger.info(f"Loop structure: {copies} copies × {len(products)} products")

    for copy_num in range(copies):
        logger.info(f"\n--- Copy #{copy_num + 1} of {copies} ---")

        for product in products:
            logger.info(f"  Label #{label_counter + 1}: '{product.get('name', 'Unknown')}'")

            # Safe barcode — tries 'barcodes' (plural), then 'barcode' (singular), then product id
            barcodes_str = str(product.get("barcodes") or product.get("barcode") or "")
            codes = [b.strip() for b in barcodes_str.split(',') if b.strip()]
            barcode = codes[0] if codes else str(product.get("id", ""))
            logger.info(f"    🔖 Barcode: {barcode}")

            # Safe selling price
            selling = (
                product.get("selling_price")
                or product.get("sellingPrice")
                or product.get("price")
                or 0
            )
            try:
                selling_val = float(str(selling).replace("₹", "").strip())
            except Exception:
                selling_val = 0.0
            logger.info(f"    💰 Selling Price: Rs.{int(selling_val)}")

            # Safe product name
            product_name = str(product.get("name", "ITEM"))[:10]

            if is_25x25_4up:
                col = label_counter % 4
                x_offset = COLUMN_X[col]

                tspl.append(
                    f'BARCODE {x_offset},{barcode_y},"128",{barcode_height},0,0,2,2,"{barcode}"'
                )
                tspl.append(f'TEXT {x_offset},{text_offset_y},"2",0,1,1,"{product_name}"')
                tspl.append(f'TEXT {x_offset},{text_offset_y + line_h},"2",0,1,1,"Rs.{int(selling_val)}"')

                label_counter += 1

                # Print only after a full row of 4 labels
                if label_counter % 4 == 0:
                    tspl.append("PRINT 1")
                    tspl.append("CLS")
                    logger.info(f"    ✅ PRINT 1 after full row (label #{label_counter})")

            else:
                # Standard wide label (80 mm default)
                batch_number = product.get('batchNumber', '')
                tspl.append("CLS")
                tspl.append(f'BARCODE 40,0,"128",55,1,0,1,2,"{barcode}"')
                if batch_number and batch_number.strip():
                    tspl.append(f'TEXT 240,6,"1",0,1,1,"{batch_number}"')
                    price_y = 54
                else:
                    price_y = 44
                tspl.append(f'TEXT 240,30,"1",0,1,1,"{product_name}"')
                tspl.append(f'TEXT 240,{price_y},"2",0,1,1,"MRP.{int(selling_val)}"')
                tspl.append("PRINT 1")
                label_counter += 1
                logger.info(f"    ✅ PRINT 1 (label #{label_counter})")

    # Handle last partial row (fewer than 4 labels)
    if is_25x25_4up and label_counter % 4 != 0:
        tspl.append("PRINT 1")
        logger.info("    ✅ PRINT 1 for final partial row")
    elif not is_25x25_4up:
        tspl.append("FEED 0")
        logger.info("✅ FEED 0 added")
    
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
