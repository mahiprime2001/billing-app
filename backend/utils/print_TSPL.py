import win32print
import logging

DOTS_PER_MM = 8  # 203 DPI


def _format_mm(value):
    if float(value).is_integer():
        return str(int(float(value)))
    return f"{float(value):.2f}".rstrip("0").rstrip(".")


def _mm(value_mm):
    try:
        return int(round(float(value_mm) * DOTS_PER_MM))
    except Exception:
        return 0


def _estimate_code128_width(data, narrow=1):
    if not data:
        return 0
    modules = (len(data) + 2) * 11 + 13 + 20
    return modules * max(1, int(narrow))


def _extract_product(product):
    """Extract barcode, name, price, batch from a product dict."""
    barcodes_str = str(product.get("barcodes") or product.get("barcode") or "")
    codes = [b.strip() for b in barcodes_str.split(",") if b.strip()]
    barcode = codes[0] if codes else str(product.get("id", ""))

    selling = product.get("selling_price") or product.get("sellingPrice") or product.get("price") or 0
    try:
        price = float(str(selling).replace("\u20b9", "").strip())
    except Exception:
        price = 0.0
    price_text = _format_mm(price)

    name = str(product.get("name", "ITEM"))
    batch = str(product.get("batchNumber") or "").strip()

    return barcode, name, price_text, batch


def _is_25x25(label_size, label_profile):
    if isinstance(label_profile, dict) and label_profile.get("type") == "25x25_4up":
        return True
    if isinstance(label_size, dict):
        w = float(label_size.get("widthMm", 0))
        h = float(label_size.get("heightMm", 0))
        return abs(w - 25.0) < 0.5 and abs(h - 25.0) < 0.5
    return False


def generate_tspl(
    products,
    copies=1,
    store_name="Company Name",
    label_size=None,
    label_profile=None,
    logger=None,
):
    if logger is None:
        logger = logging.getLogger(__name__)
        logger.setLevel(logging.INFO)

    logger.info(f"TSPL: {len(products)} products x {copies} copies")

    tspl = []
    expanded = [p for p in products for _ in range(copies)]

    if _is_25x25(label_size, label_profile):
        tspl_string = _generate_25x25(tspl, expanded, label_profile, logger)
    else:
        tspl_string = _generate_standard(tspl, expanded, label_size, logger)

    logger.info(f"TSPL: generated {len(tspl)} commands")
    return tspl_string


def _generate_25x25(tspl, labels, label_profile, logger):
    # Sheet geometry defaults
    cfg = {
        "paper_width_mm": 103.0,
        "paper_height_mm": 25.0,
        "gap_vertical_mm": 3.0,
        "gap_horizontal_mm": 0.0,
        "margin_left_mm": 2.0,
        "label_width_mm": 24.75,  # (103 - 2 - 2) / 4
    }
    if isinstance(label_profile, dict):
        for key in cfg:
            if key in label_profile:
                try:
                    cfg[key] = float(label_profile[key])
                except Exception:
                    pass

    # Printer setup
    tspl.append(f"SIZE {_format_mm(cfg['paper_width_mm'])} mm,{_format_mm(cfg['paper_height_mm'])} mm")
    tspl.append(f"GAP {_format_mm(cfg['gap_vertical_mm'])} mm,0 mm")
    for cmd in ("DENSITY 8", "SPEED 3", "DIRECTION 1", "REFERENCE 0,0",
                "SET PEEL OFF", "SET CUTTER OFF", "SET TEAR ON", "CALIBRATE"):
        tspl.append(cmd)

    # Column geometry
    label_w = _mm(cfg["label_width_mm"])
    label_h = _mm(cfg["paper_height_mm"])
    gap_h = _mm(cfg["gap_horizontal_mm"])
    margin_l = _mm(cfg["margin_left_mm"])
    paper_w = _mm(cfg["paper_width_mm"])

    slot_pitch = label_w + gap_h
    max_cols = 1
    if slot_pitch > 0:
        max_cols = min(4, max(1, (paper_w - margin_l + gap_h) // slot_pitch))
    column_x = [margin_l + i * slot_pitch for i in range(max_cols)]

    # Y layout
    inner_pad = max(4, _mm(0.5))
    bc_y, bc_h = 2, 60
    num_y = bc_y + bc_h + 2       # 64
    name_y = num_y + 14           # 78
    price_y = name_y + 13         # 91
    batch_y = price_y + 13        # 104

    # Generate labels in rows of max_cols
    for row_start in range(0, len(labels), max_cols):
        row = labels[row_start:row_start + max_cols]
        tspl.append("CLS")

        for col, product in enumerate(row):
            x_off = column_x[col]
            barcode, name, price, batch = _extract_product(product)

            # Centre barcode in column
            bc_w = _estimate_code128_width(barcode, narrow=1)
            available = label_w - 2 * inner_pad
            bc_x = x_off + inner_pad + max(0, (available - bc_w) // 2)
            tx = x_off + inner_pad

            tspl.append(f'BARCODE {bc_x},{bc_y},"128",{bc_h},0,0,1,1,"{barcode}"')
            tspl.append(f'TEXT {tx},{num_y},"1",0,1,1,"{barcode}"')
            tspl.append(f'TEXT {tx},{name_y},"1",0,1,1,"{name}"')
            tspl.append(f'TEXT {tx},{price_y},"1",0,1,1,"Rs.{price}"')
            if batch:
                tspl.append(f'TEXT {tx},{batch_y},"1",0,1,1,"B:{batch}"')

        tspl.append("PRINT 1")

    return "\r\n".join(tspl) + "\r\n"


def _generate_standard(tspl, labels, label_size, logger):
    width_mm, height_mm = 80.0, 12.0
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
    for cmd in ("DENSITY 10", "SPEED 2", "DIRECTION 1", "REFERENCE 0,0",
                "SET PEEL OFF", "SET CUTTER OFF", "SET TEAR ON"):
        tspl.append(cmd)

    for product in labels:
        barcode, name, price, batch = _extract_product(product)

        tspl.append("CLS")
        tspl.append(f'BARCODE 40,0,"128",55,1,0,1,2,"{barcode}"')
        if batch:
            tspl.append(f'TEXT 240,6,"1",0,1,1,"{batch}"')
            py = 54
        else:
            py = 44
        tspl.append(f'TEXT 240,30,"1",0,1,1,"{name}"')
        tspl.append(f'TEXT 240,{py},"2",0,1,1,"MRP.{price}"')
        tspl.append("PRINT 1")

    tspl.append("FEED 0")
    return "\r\n".join(tspl) + "\r\n"


# ==============================================================
# 80mm x 12mm standalone functions
# ==============================================================

def generate_80x12(products, copies=1, logger=None):
    """Generate TSPL commands for 80mm x 12mm labels."""
    if logger is None:
        logger = logging.getLogger(__name__)
        logger.setLevel(logging.INFO)

    logger.info(f"80x12: {len(products)} products x {copies} copies")

    tspl = []
    tspl.append("SIZE 80 mm,12 mm")
    tspl.append("GAP 4 mm,0 mm")
    for cmd in ("DENSITY 10", "SPEED 2", "DIRECTION 1", "REFERENCE 0,0",
                "SET PEEL OFF", "SET CUTTER OFF", "SET TEAR ON"):
        tspl.append(cmd)

    for product in products:
        for _ in range(copies):
            barcode, name, price, batch = _extract_product(product)

            tspl.append("CLS")
            tspl.append(f'BARCODE 40,0,"128",55,1,0,1,2,"{barcode}"')
            if batch:
                tspl.append(f'TEXT 240,6,"1",0,1,1,"{batch}"')
                py = 54
            else:
                py = 44
            tspl.append(f'TEXT 240,30,"1",0,1,1,"{name}"')
            tspl.append(f'TEXT 240,{py},"2",0,1,1,"MRP.{price}"')
            tspl.append("PRINT 1")

    tspl.append("FEED 0")

    logger.info(f"80x12: generated {len(tspl)} commands")
    return "\r\n".join(tspl) + "\r\n"


def print_80x12(printer_name, products, copies=1, logger=None):
    """Generate and print 80mm x 12mm labels in one call."""
    if logger is None:
        logger = logging.getLogger(__name__)
        logger.setLevel(logging.INFO)

    tspl_commands = generate_80x12(products, copies, logger)
    send_raw_to_printer(printer_name, tspl_commands, logger)
    return tspl_commands


def send_raw_to_printer(printer_name, raw_data, logger=None):
    if logger is None:
        logger = logging.getLogger(__name__)
        logger.setLevel(logging.INFO)

    logger.info(f"Sending {len(raw_data)} bytes to printer '{printer_name}'")

    printers = win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL, None, 1)
    available = [name for _, _, name, _ in printers]

    exact = next((n for n in available if n.lower() == printer_name.lower()), None)
    if not exact:
        raise ValueError(f"Printer '{printer_name}' not found. Available: {available}")

    handle = win32print.OpenPrinter(exact)
    try:
        win32print.StartDocPrinter(handle, 1, ("TSPL Print Job", None, "RAW"))
        win32print.StartPagePrinter(handle)
        win32print.WritePrinter(handle, raw_data.encode("utf-8"))
        win32print.EndPagePrinter(handle)
        win32print.EndDocPrinter(handle)
        logger.info("Print job completed")
        return True
    except Exception:
        logger.error("Printing failed", exc_info=True)
        raise
    finally:
        win32print.ClosePrinter(handle)
