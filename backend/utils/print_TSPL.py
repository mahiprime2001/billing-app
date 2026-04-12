import win32print
import logging

DOTS_PER_MM = 8  # 203 DPI


# ==============================================================
# Helpers
# ==============================================================

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


# ==============================================================
# Printer language detection
# ==============================================================

def _get_printer_language(printer_name):
    """
    Detect which command language a printer speaks based on its name.

    Add new printer models to the appropriate list below as you encounter them.
    Returns one of: 'zpl', 'tspl', 'epl', 'dpl', 'escpos'
    Defaults to 'tspl' if nothing matches (safe default for TSC/TVS family).
    """
    name = (printer_name or "").lower()

    # ---------- ZPL (Zebra and compatibles) ----------
    zpl_keywords = [
        "zdesigner",
        "zebra",
        "zd220", "zd230", "zd410", "zd420", "zd421", "zd500", "zd620",
        "gk420", "gx420", "gk888", "gx430",
        "zt230", "zt410", "zt411", "zt420", "zt610",
        "tlp 2844", "lp 2844",
    ]

    # ---------- TSPL / TSPL2 (TSC, TVS, Argox, some Godex, some Postek) ----------
    tspl_keywords = [
        "tsc",
        "ttp-244", "ttp-245", "ttp-247", "ttp-342", "ttp-345",
        "da200", "da210", "da220", "da300",
        "te200", "te210", "te310",
        "tdp-225", "tdp-245", "tdp-247",
        # TVS Electronics label printers (all speak TSPL)
        "tvs", "tvs-e", "tvs electronics",
        "lp 44", "lp44", "lp 45", "lp45", "lp 46", "lp46",
        "lp 245", "lp245", "lp 246", "lp246",
        "lp 2844", "lp2844",         # note: also in zpl_keywords — ZPL check runs first
        "lp 3000", "lp3000", "lp 3500", "lp3500",
        "dlite", "neo", "star", "pro", "plus",
        "lp 46 tt", "lp 46 bt", "lp 46 neo", "lp 46 star",
        "lp 46 pro", "lp 46 lite", "lp 46 plus",
        "lite",
        "argox",
        "os-214", "os-2140", "cp-2140", "cp-3140",
        "godex",
        "rt200", "rt230", "g500", "ez-1100",
        "postek",
    ]

    # ---------- EPL (older Zebra/Eltron) ----------
    epl_keywords = ["eltron", "lp 2442"]

    # ---------- DPL (Datamax-O'Neil / Honeywell) ----------
    dpl_keywords = [
        "datamax", "honeywell",
        "m-class", "e-class", "i-class",
        "pc42", "pc43",
    ]

    # ---------- ESC/POS (receipt printers — flagged so we don't send label commands) ----------
    escpos_keywords = [
        "epson tm", "tm-t", "tm-u",
        "rp3160", "rp 3160", "rp-3160",
        "pos-58", "pos-80",
        "xprinter",
    ]

    if any(k in name for k in zpl_keywords):
        return "zpl"
    if any(k in name for k in epl_keywords):
        return "epl"
    if any(k in name for k in dpl_keywords):
        return "dpl"
    if any(k in name for k in escpos_keywords):
        return "escpos"
    if any(k in name for k in tspl_keywords):
        return "tspl"

    return "tspl"  # safe default


# ==============================================================
# Main entry (back-compat name, language chosen by printer)
# ==============================================================

def generate_tspl(
    products,
    copies=1,
    store_name="Company Name",
    label_size=None,
    label_profile=None,
    logger=None,
    printer_name=None,
):
    if logger is None:
        logger = logging.getLogger(__name__)
        logger.setLevel(logging.INFO)

    language = _get_printer_language(printer_name)
    logger.info(f"generate_tspl: language='{language}' printer='{printer_name}' "
                f"{len(products)} products x {copies} copies")

    labels = [p for p in products for _ in range(copies)]

    if _is_25x25(label_size, label_profile):
        if language == "zpl":
            return _generate_25x25_zpl(labels, label_profile)
        if language == "tspl":
            return _generate_25x25_tspl(labels, label_profile)
        raise NotImplementedError(
            f"25x25 layout not implemented for language '{language}' "
            f"(printer='{printer_name}'). Add _generate_25x25_{language}()."
        )

    # Standard (80x12 by default, or whatever label_size says)
    width_mm, height_mm = 80.0, 12.0
    if isinstance(label_size, dict):
        try:
            w = float(label_size.get("widthMm", width_mm))
            h = float(label_size.get("heightMm", height_mm))
            if w > 0 and h > 0:
                width_mm, height_mm = w, h
        except Exception:
            pass

    if language == "zpl":
        return _generate_standard_zpl(labels, width_mm, height_mm)
    if language == "tspl":
        return _generate_standard_tspl(labels, width_mm, height_mm)
    raise NotImplementedError(
        f"Standard layout not implemented for language '{language}' "
        f"(printer='{printer_name}'). Add _generate_standard_{language}()."
    )


# ==============================================================
# 80x12 mm — TSPL
# ==============================================================

def _generate_standard_tspl(labels, width_mm, height_mm):
    """TSPL version of the 80x12 layout (works for any single-cell size)."""
    tspl = []
    tspl.append(f"SIZE {_format_mm(width_mm)} mm,{_format_mm(height_mm)} mm")
    tspl.append("GAP 4 mm,0 mm")
    for cmd in ("DENSITY 10", "SPEED 2", "DIRECTION 1", "SHIFT 0", "REFERENCE 0,0",
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
# 80x12 mm — ZPL
# ==============================================================
# Layout math (203 dpi, 8 dots/mm):
#   80 mm wide  = 640 dots
#   12 mm tall  =  96 dots
#
# Same (x, y) dot coordinates as TSPL so both printers produce identical layouts:
#   Barcode : (40, 0), height 55, narrow module 1 dot  -> ~180 dots wide for
#             a 13-char Code128 string, ending near x=220.  Leaves a ~20-dot
#             gap before text block at x=240.
#   Text column starts at x=240, giving ~400 dots of horizontal room (240-640).
#   Vertical stack fits in 96 dots:
#       y= 6  -> batch  (small font)   ends ~y=22
#       y=30  -> name   (small font)   ends ~y=46
#       y=44  -> price w/o batch       ends ~y=68
#       y=54  -> price with batch      ends ~y=76   (barcode+readable ~y=75)

def _generate_standard_zpl(labels, width_mm, height_mm):
    """ZPL version of the 80x12 layout (works for any single-cell size)."""
    pw = _mm(width_mm)     # 640 for 80mm
    ll = _mm(height_mm)    # 96 for 12mm

    zpl = []
    for product in labels:
        barcode, name, price, batch = _extract_product(product)

        zpl.append("^XA")
        zpl.append(f"^PW{pw}")          # print width in dots
        zpl.append(f"^LL{ll}")          # label length in dots
        zpl.append("^LH0,0")            # home origin
        zpl.append("^CI28")             # UTF-8 (needed for ₹ and accented names)
        zpl.append("~SD15")             # darkness (matches TSPL DENSITY 10 roughly)
        zpl.append("^PR2")              # speed (matches TSPL SPEED 2)

        # Barcode at (40, 0) — narrow module = 1 dot, height = 55 dots,
        # show human-readable line (Y), placed below (N = not above).
        zpl.append("^BY1,2,55")
        zpl.append(f"^FO40,0^BCN,55,Y,N,N^FD{barcode}^FS")

        # Text block at x=240 — fonts chosen to roughly match TSPL "1" and "2".
        if batch:
            zpl.append(f"^FO240,6^A0N,14,10^FD{batch}^FS")
            py = 54
        else:
            py = 44
        zpl.append(f"^FO240,30^A0N,14,10^FD{name}^FS")
        zpl.append(f"^FO240,{py}^A0N,22,16^FDMRP.{price}^FS")

        zpl.append("^PQ1")
        zpl.append("^XZ")

    return "\n".join(zpl) + "\n"


# ==============================================================
# 25x25 mm 4-up — TSPL
# ==============================================================

def _25x25_cfg(label_profile):
    cfg = {
        "paper_width_mm": 103.0,
        "paper_height_mm": 25.0,
        "gap_vertical_mm": 3.0,
        "gap_horizontal_mm": 0.0,
        "margin_left_mm": 2.0,
        "label_width_mm": 24.75,
    }
    if isinstance(label_profile, dict):
        for key in cfg:
            if key in label_profile:
                try:
                    cfg[key] = float(label_profile[key])
                except Exception:
                    pass
    return cfg


def _25x25_geometry(cfg):
    label_w = _mm(cfg["label_width_mm"])
    gap_h = _mm(cfg["gap_horizontal_mm"])
    margin_l = _mm(cfg["margin_left_mm"])
    paper_w = _mm(cfg["paper_width_mm"])

    slot_pitch = label_w + gap_h
    max_cols = 1
    if slot_pitch > 0:
        max_cols = min(4, max(1, (paper_w - margin_l + gap_h) // slot_pitch))
    column_x = [margin_l + i * slot_pitch for i in range(max_cols)]
    inner_pad = max(4, _mm(0.5))
    return label_w, max_cols, column_x, inner_pad


def _generate_25x25_tspl(labels, label_profile):
    cfg = _25x25_cfg(label_profile)

    tspl = []
    tspl.append(f"SIZE {_format_mm(cfg['paper_width_mm'])} mm,{_format_mm(cfg['paper_height_mm'])} mm")
    tspl.append(f"GAP {_format_mm(cfg['gap_vertical_mm'])} mm,0 mm")
    for cmd in ("DENSITY 8", "SPEED 3", "DIRECTION 1", "SHIFT 0", "REFERENCE 0,0",
                "SET PEEL OFF", "SET CUTTER OFF", "SET TEAR ON", "CALIBRATE"):
        tspl.append(cmd)

    label_w, max_cols, column_x, inner_pad = _25x25_geometry(cfg)

    bc_y, bc_h = 2, 60
    num_y = bc_y + bc_h + 2       # 64
    name_y = num_y + 14           # 78
    price_y = name_y + 13         # 91
    batch_y = price_y + 13        # 104

    for row_start in range(0, len(labels), max_cols):
        row = labels[row_start:row_start + max_cols]
        tspl.append("CLS")

        for col, product in enumerate(row):
            x_off = column_x[col]
            barcode, name, price, batch = _extract_product(product)

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


# ==============================================================
# 25x25 mm 4-up — ZPL
# ==============================================================

def _generate_25x25_zpl(labels, label_profile):
    cfg = _25x25_cfg(label_profile)
    pw = _mm(cfg["paper_width_mm"])      # 824 for 103mm
    ll = _mm(cfg["paper_height_mm"])     # 200 for 25mm

    label_w, max_cols, column_x, inner_pad = _25x25_geometry(cfg)

    bc_y, bc_h = 2, 60
    num_y = bc_y + bc_h + 2       # 64
    name_y = num_y + 14           # 78
    price_y = name_y + 13         # 91
    batch_y = price_y + 13        # 104

    zpl = []
    for row_start in range(0, len(labels), max_cols):
        row = labels[row_start:row_start + max_cols]

        zpl.append("^XA")
        zpl.append(f"^PW{pw}")
        zpl.append(f"^LL{ll}")
        zpl.append("^LH0,0")
        zpl.append("^CI28")
        zpl.append("~SD12")             # darkness (roughly matches TSPL DENSITY 8)
        zpl.append("^PR3")              # speed
        zpl.append("^BY1,2,60")         # default narrow=1, ratio 2, default height 60

        for col, product in enumerate(row):
            x_off = column_x[col]
            barcode, name, price, batch = _extract_product(product)

            bc_w = _estimate_code128_width(barcode, narrow=1)
            available = label_w - 2 * inner_pad
            bc_x = x_off + inner_pad + max(0, (available - bc_w) // 2)
            tx = x_off + inner_pad

            # Barcode: no readable line (N) to match TSPL readable=0 in 25x25 layout
            zpl.append(f"^FO{bc_x},{bc_y}^BCN,{bc_h},N,N,N^FD{barcode}^FS")
            zpl.append(f"^FO{tx},{num_y}^A0N,12,10^FD{barcode}^FS")
            zpl.append(f"^FO{tx},{name_y}^A0N,12,10^FD{name}^FS")
            zpl.append(f"^FO{tx},{price_y}^A0N,12,10^FDRs.{price}^FS")
            if batch:
                zpl.append(f"^FO{tx},{batch_y}^A0N,12,10^FDB:{batch}^FS")

        zpl.append("^PQ1")
        zpl.append("^XZ")

    return "\n".join(zpl) + "\n"


# ==============================================================
# 80mm x 12mm convenience
# ==============================================================

def generate_80x12(products, copies=1, printer_name="", logger=None):
    """Generate label commands for 80x12 labels in the right language."""
    if logger is None:
        logger = logging.getLogger(__name__)
        logger.setLevel(logging.INFO)

    language = _get_printer_language(printer_name)
    logger.info(f"80x12: language='{language}' printer='{printer_name}' "
                f"{len(products)} products x {copies} copies")

    labels = [p for p in products for _ in range(copies)]

    if language == "zpl":
        return _generate_standard_zpl(labels, 80.0, 12.0)
    if language == "tspl":
        return _generate_standard_tspl(labels, 80.0, 12.0)

    raise NotImplementedError(
        f"80x12 not implemented for language '{language}' (printer='{printer_name}'). "
        f"Add the branch in generate_80x12()."
    )


def print_80x12(printer_name, products, copies=1, logger=None):
    """Detect language, generate commands, and print in one call."""
    commands = generate_80x12(products, copies, printer_name=printer_name, logger=logger)
    send_raw_to_printer(printer_name, commands, logger)
    return commands


# ==============================================================
# Raw transport (Windows)
# ==============================================================

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
        win32print.StartDocPrinter(handle, 1, ("Label Print Job", None, "RAW"))
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
