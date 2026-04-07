import win32print
import logging


def _format_mm(value):
    if float(value).is_integer():
        return str(int(float(value)))
    return f"{float(value):.2f}".rstrip("0").rstrip(".")


DOTS_PER_MM = 8  # 203 DPI


def _mm_to_dots(value_mm):
    try:
        return int(round(float(value_mm) * DOTS_PER_MM))
    except Exception:
        return 0


def _estimate_code128_width_dots(data, narrow=1):
    if not data:
        return 0
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

    logger.info("=" * 60)
    logger.info("🖨️  STARTING TSPL GENERATION")
    logger.info(f"📦 Products Count: {len(products)}")
    logger.info(f"📄 Copies Requested: {copies}")
    logger.info(f"🏷️  Total Labels to Print: {len(products) * copies}")
    logger.info(f"🏪 Store Name: {store_name}")
    logger.info(f"📐 Label Profile: {label_profile if isinstance(label_profile, dict) else {}}")
    logger.info("=" * 60)

    tspl = []

    # ── Detect 25x25 4-up profile ─────────────────────────────────
    is_25x25_4up = (
        isinstance(label_profile, dict) and label_profile.get("type") == "25x25_4up"
    ) or (
        isinstance(label_size, dict)
        and abs(float(label_size.get("widthMm", 0)) - 25.0) < 0.5
        and abs(float(label_size.get("heightMm", 0)) - 25.0) < 0.5
    )

    # ── Printer setup ─────────────────────────────────────────────
    if is_25x25_4up:
        # Sheet geometry:
        # Total width : 103 mm
        # Left margin : 2 mm  |  Right margin: 2 mm
        # Usable width: 99 mm  →  4 labels × 24.75 mm each, 0 mm gap between labels
        # Label height: 25 mm
        paper_width_mm    = 103.0
        paper_height_mm   = 25.0
        gap_vertical_mm   = 3.0
        gap_horizontal_mm = 0.0
        margin_left_mm    = 2.0
        label_width_mm    = 24.75   # (103 - 2 - 2) / 4

        # Allow profile overrides
        if isinstance(label_profile, dict):
            try:
                paper_width_mm    = float(label_profile.get("paper_width_mm",    paper_width_mm))
                paper_height_mm   = float(label_profile.get("paper_height_mm",   paper_height_mm))
                gap_vertical_mm   = float(label_profile.get("gap_vertical_mm",   gap_vertical_mm))
                gap_horizontal_mm = float(label_profile.get("gap_horizontal_mm", gap_horizontal_mm))
                margin_left_mm    = float(label_profile.get("margin_left_mm",    margin_left_mm))
                label_width_mm    = float(label_profile.get("label_width_mm",    label_width_mm))
            except Exception:
                pass

        tspl.append(f"SIZE {_format_mm(paper_width_mm)} mm,{_format_mm(paper_height_mm)} mm")
        tspl.append(f"GAP {_format_mm(gap_vertical_mm)} mm,0 mm")
        tspl.append("DENSITY 8")
        tspl.append("SPEED 3")
        tspl.append("DIRECTION 1")
        tspl.append("REFERENCE 0,0")
        tspl.append("SET PEEL OFF")
        tspl.append("SET CUTTER OFF")
        tspl.append("SET TEAR ON")
        tspl.append("CALIBRATE")

        logger.info(
            f"📐 Sheet: {paper_width_mm}mm wide | label={label_width_mm}mm | "
            f"margin_left={margin_left_mm}mm | gap_h={gap_horizontal_mm}mm | gap_v={gap_vertical_mm}mm"
        )

    else:
        width_mm  = 80.0
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

        label_width_mm    = width_mm
        paper_height_mm   = height_mm
        gap_horizontal_mm = 0.0
        margin_left_mm    = 0.0
        paper_width_mm    = width_mm

    logger.info(f"✅ Setup commands added ({len(tspl)} commands so far)")

    # ── Column geometry ───────────────────────────────────────────
    label_width_dots    = _mm_to_dots(label_width_mm)
    label_height_dots   = _mm_to_dots(paper_height_mm)
    gap_horizontal_dots = _mm_to_dots(gap_horizontal_mm)
    margin_left_dots    = _mm_to_dots(margin_left_mm)
    paper_width_dots    = _mm_to_dots(paper_width_mm)

    slot_pitch  = label_width_dots + gap_horizontal_dots
    max_columns = 4 if is_25x25_4up else 1

    if is_25x25_4up and slot_pitch > 0:
        possible_cols = max(1, int(
            (paper_width_dots - margin_left_dots + gap_horizontal_dots) // slot_pitch
        ))
        max_columns = min(4, possible_cols)

    column_x = [margin_left_dots + i * slot_pitch for i in range(max_columns)]

    logger.info(
        f"📏 Dots: label_w={label_width_dots} label_h={label_height_dots} "
        f"slot_pitch={slot_pitch} margin_left={margin_left_dots} "
        f"columns={max_columns} x_offsets={column_x}"
    )

    # ── Y layout (all within 200 dots = 25mm) ─────────────────────
    #  Y=2    barcode starts  (height 60 dots ≈ 7.5mm)
    #  Y=64   barcode number text
    #  Y=78   product name
    #  Y=91   Rs. PRICE
    #  Y=104  B: batch number
    #  Y=200  label bottom  — all content fits
    inner_pad_x    = max(4, _mm_to_dots(0.5))
    barcode_y      = 2
    barcode_height = 60
    barcode_num_y  = barcode_y + barcode_height + 2    # 64
    text_name_y    = barcode_num_y + 14                # 78
    text_price_y   = text_name_y   + 13                # 91
    text_batch_y   = text_price_y  + 13                # 104

    logger.info(
        f"📐 Y layout — barcode:{barcode_y}-{barcode_y+barcode_height} | "
        f"code#:{barcode_num_y} | name:{text_name_y} | "
        f"price:{text_price_y} | batch:{text_batch_y} | "
        f"label_h:{label_height_dots}"
    )

    # ── Expand labels (copies per product) ───────────────────────
    expanded_labels = []
    for product in products:
        for _ in range(copies):
            expanded_labels.append(product)
    logger.info(f"📝 Expanded label count: {len(expanded_labels)}")

    # ── Generate TSPL ─────────────────────────────────────────────
    label_counter = 0

    if is_25x25_4up:
        row_count = 0
        for row_start in range(0, len(expanded_labels), max_columns):
            row_labels = expanded_labels[row_start:row_start + max_columns]
            tspl.append("CLS")

            for col, product in enumerate(row_labels):
                label_counter += 1
                x_offset = column_x[col]

                # Barcode
                barcodes_str = str(product.get("barcodes") or product.get("barcode") or "")
                codes   = [b.strip() for b in barcodes_str.split(',') if b.strip()]
                barcode = codes[0] if codes else str(product.get("id", ""))

                # Selling price
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

                # Name & batch
                product_name = str(product.get("name", "ITEM"))[:12]
                batch_number = str(product.get("batchNumber") or "")[:12]

                logger.info(
                    f"  Label #{label_counter} col={col}: '{product_name}' | "
                    f"barcode={barcode} | price=Rs.{int(selling_val)} | batch='{batch_number}'"
                )

                # Centre barcode in its slot
                barcode_w = _estimate_code128_width_dots(barcode, narrow=1)
                available = label_width_dots - 2 * inner_pad_x
                barcode_x = x_offset + inner_pad_x + max(0, int((available - barcode_w) / 2))
                text_x    = x_offset + inner_pad_x

                tspl.append(
                    f'BARCODE {barcode_x},{barcode_y},"128",{barcode_height},0,0,1,1,"{barcode}"'
                )
                tspl.append(f'TEXT {text_x},{barcode_num_y},"1",0,1,1,"{barcode[:18]}"')
                tspl.append(f'TEXT {text_x},{text_name_y},"1",0,1,1,"{product_name}"')
                tspl.append(f'TEXT {text_x},{text_price_y},"1",0,1,1,"Rs.{int(selling_val)}"')
                if batch_number.strip():
                    tspl.append(f'TEXT {text_x},{text_batch_y},"1",0,1,1,"B:{batch_number}"')

            tspl.append("PRINT 1")
            row_count += 1
            logger.info(f"  → PRINT 1 (row #{row_count}, labels {row_start+1}–{row_start+len(row_labels)})")

        logger.info(f"✅ 25x25 4-up: {row_count} rows × up to {max_columns} cols = {label_counter} labels")

    else:
        # Standard wide label
        for product in expanded_labels:
            barcodes_str = str(product.get("barcodes") or product.get("barcode") or "")
            codes   = [b.strip() for b in barcodes_str.split(',') if b.strip()]
            barcode = codes[0] if codes else str(product.get("id", ""))

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

            product_name = str(product.get("name", "ITEM"))[:10]
            batch_number = str(product.get("batchNumber") or "")

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

        tspl.append("FEED 0")

    # ── Summary ───────────────────────────────────────────────────
    total_labels   = len(products) * copies
    total_commands = len(tspl)

    logger.info("\n" + "=" * 60)
    logger.info("📊 TSPL GENERATION SUMMARY")
    logger.info(f"Total Labels Generated : {label_counter}")
    logger.info(f"Expected Labels        : {total_labels}")
    logger.info(f"Match: {'✅ YES' if label_counter == total_labels else '❌ NO - MISMATCH!'}")
    logger.info(f"Total TSPL Commands    : {total_commands}")
    logger.info("=" * 60)

    tspl_string = "\r\n".join(tspl) + "\r\n"
    logger.debug(f"\n📄 FULL TSPL COMMANDS:\n{tspl_string}\n")
    return tspl_string


def send_raw_to_printer(printer_name, raw_data, logger=None):
    if logger is None:
        logger = logging.getLogger(__name__)
        logger.setLevel(logging.INFO)

    logger.info("\n" + "=" * 60)
    logger.info("🖨️  SENDING TO PRINTER")
    logger.info(f"Printer Name: {printer_name}")
    logger.info(f"Data Size: {len(raw_data)} bytes")
    logger.info("=" * 60)

    printers = win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL, None, 1)
    available_printer_names = [name for flags, description, name, comment in printers]
    logger.info(f"Available Printers: {available_printer_names}")

    exact_printer_name = next(
        (name for name in available_printer_names if name.lower() == printer_name.lower()),
        None
    )

    if not exact_printer_name:
        error_msg = f"❌ Printer '{printer_name}' not found. Available: {available_printer_names}"
        logger.error(error_msg)
        raise ValueError(error_msg)

    logger.info(f"✅ Found printer: '{exact_printer_name}'")
    handle = win32print.OpenPrinter(exact_printer_name)
    logger.info("✅ Printer handle opened")

    try:
        job_id = win32print.StartDocPrinter(handle, 1, ("TSPL Print Job", None, "RAW"))
        logger.info(f"✅ Print job started (Job ID: {job_id})")
        win32print.StartPagePrinter(handle)
        win32print.WritePrinter(handle, raw_data.encode('utf-8'))
        logger.info(f"✅ Data written ({len(raw_data)} bytes)")
        win32print.EndPagePrinter(handle)
        win32print.EndDocPrinter(handle)
        logger.info("=" * 60)
        logger.info("🎉 PRINT JOB COMPLETED SUCCESSFULLY")
        logger.info("=" * 60)
        return True

    except Exception as e:
        logger.error(f"❌ Printing error: {e}", exc_info=True)
        raise
    finally:
        win32print.ClosePrinter(handle)
        logger.info("🔒 Printer handle closed")
