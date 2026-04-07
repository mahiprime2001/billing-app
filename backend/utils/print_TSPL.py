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
    is_25x25 = (
        isinstance(label_profile, dict) and label_profile.get("type") == "25x25_4up"
    ) or (
        isinstance(label_size, dict)
        and abs(float(label_size.get("widthMm", 0)) - 25.0) < 0.5
        and abs(float(label_size.get("heightMm", 0)) - 25.0) < 0.5
    )
    is_25x25_4up = is_25x25
    profile_columns = 1
    profile_label_w = 0.0
    profile_paper_w = 0.0
    profile_gap_h = 0.0
    profile_gap_v = 0.0
    profile_margin_left = 0.0
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
    if is_25x25_4up:
        try:
            profile_columns = max(1, int(label_profile.get("columns") or 4))
        except Exception:
            profile_columns = 4
        try:
            profile_label_w = float(label_profile.get("label_width_mm") or 25)
        except Exception:
            profile_label_w = 25.0
        try:
            # Horizontal pitch between columns; many 4-up 25mm stocks are ~0-0.5mm.
            profile_gap_h = float(label_profile.get("gap_horizontal_mm") or 0.5)
        except Exception:
            profile_gap_h = 0.5
        try:
            # Feed-direction gap between label rows.
            profile_gap_v = float(label_profile.get("gap_vertical_mm") or 2)
        except Exception:
            profile_gap_v = 2.0
        try:
            profile_paper_w = float(label_profile.get("paper_width_mm") or 103)
        except Exception:
            profile_paper_w = 103.0
        try:
            paper_h = float(label_profile.get("paper_height_mm") or profile_label_w)
        except Exception:
            paper_h = profile_label_w

        # Optional explicit margins; defaults are 1.5mm on both sides for this stock.
        margin_left_raw = label_profile.get("margin_left_mm")
        margin_right_raw = label_profile.get("margin_right_mm")
        try:
            margin_left_mm = float(margin_left_raw) if margin_left_raw is not None else 1.5
        except Exception:
            margin_left_mm = 1.5
        try:
            margin_right_mm = float(margin_right_raw) if margin_right_raw is not None else 1.5
        except Exception:
            margin_right_mm = 1.5

        used_width_mm = (profile_columns * profile_label_w) + (
            max(0, profile_columns - 1) * profile_gap_h
        )
        remaining_mm = max(0.0, profile_paper_w - used_width_mm)
        if margin_left_mm is not None:
            profile_margin_left = max(0.0, margin_left_mm)
        else:
            profile_margin_left = max(0.0, remaining_mm - margin_right_mm)

        tspl.append(f"SIZE {_format_mm(profile_paper_w)} mm,{_format_mm(paper_h)} mm")
        tspl.append(f"GAP {_format_mm(profile_gap_v)} mm,0 mm")
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
                x_offset = _mm_to_dots(profile_margin_left + (col_index * label_pitch_mm))
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
            
            # Selling price (resolve field names)
            selling = product.get('selling_price')
            if selling is None or selling == '':
                selling = product.get('sellingPrice')
            if selling is None or selling == '':
                selling = 0
            try:
                selling_val = float(selling)
            except Exception:
                selling_val = 0.0
            logger.info(f"    💰 Selling Price: Rs.{int(selling_val)}")

            # Batch Information (if available)
            batch_number = product.get('batchNumber', '')

            if is_25x25_4up:
                # ── 25 x 25 mm label layout (200 × 200 dots at 203 DPI) ──
                #
                # Zone breakdown (dots, top→bottom):
                #   4        : top margin
                #   4..84    : barcode bars (height = 80)
                #   84..104  : gap between barcode and text
                #   104..120 : product name  (font "1" ≈ 12 dots tall)
                #   122..138 : price          (font "1")
                #
                # human_readable=0  →  no auto-printed number below bars,
                # which was causing the overlap with the TEXT commands.

                # ── Vertical zones (dots) ──────────────────────────────
                # 0..4       top margin
                # 4..74      barcode bars  (height=70)
                # 74..90     clear gap     (16 dots — no human_readable number
                #                           so nothing auto-prints here)
                # 90..102    batch line    (font "1" ≈ 12 dots tall)  [optional]
                # 106..118   product name
                # 122..134   price
                # ──────────────────────────────────────────────────────────
                # human_readable=0 is critical: setting it to 1 causes the
                # printer to auto-print the barcode digits directly below the
                # bars (~18 dots), which was overlapping with batch/name text.

                barcode_height = 70
                barcode_y = 4

                # Center barcode horizontally within this column's 200-dot width.
                barcode_est_w = _estimate_code128_width_dots(barcode, narrow=1)
                label_center = x_offset + profile_label_w_dots // 2
                barcode_x = label_center - barcode_est_w // 2
                barcode_x = max(x_offset, barcode_x)  # clamp to label left edge

                # human_readable=0 → no auto-printed number below bars
                tspl.append(
                    f'BARCODE {barcode_x},{barcode_y},"128",{barcode_height},0,0,1,2,"{barcode}"'
                )

                # Text lines — left-aligned, 16-dot gap below barcode bottom
                text_x = x_offset + 4
                line_h = 16  # dots between text baselines

                # First text line starts 16 dots below the last bar
                text_y = barcode_y + barcode_height + 16  # 4+70+16 = 90

                # Batch (optional) — clearly below barcode, no overlap possible
                if batch_number and batch_number.strip():
                    tspl.append(f'TEXT {text_x},{text_y},"1",0,1,1,"{batch_number[:13]}"')
                    text_y += line_h

                # Product name (truncate at 13 chars to fit 25 mm width)
                product_name = product["name"][:13]
                tspl.append(f'TEXT {text_x},{text_y},"1",0,1,1,"{product_name}"')

                text_y += line_h
                tspl.append(f'TEXT {text_x},{text_y},"1",0,1,1,"Rs.{int(selling_val)}"')

            else:
                # ── Standard wide label layout (80 mm default) ──
                tspl.append(f'BARCODE {40 + x_offset},{0 + y_offset},"128",55,1,0,1,2,"{barcode}"')

                if batch_number and batch_number.strip():
                    logger.info(f"    📦 Batch: {batch_number}")
                    tspl.append(f'TEXT {240 + x_offset},{6 + y_offset},"1",0,1,1,"{batch_number}"')
                    price_y = 54
                else:
                    price_y = 44

                tspl.append(f'TEXT {240 + x_offset},{30 + y_offset},"1",0,1,1,"{product["name"]}"')
                tspl.append(f'TEXT {240 + x_offset},{price_y + y_offset},"2",0,1,1,"MRP.{int(selling_val)}"')
            
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

    # For 25x25 4-up labels, PRINT 1 already parks the paper at the next label
    # start. Adding FEED here causes the printer to eject one extra blank row.
    if not is_25x25_4up:
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
