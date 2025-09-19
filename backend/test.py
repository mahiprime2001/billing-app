import win32print, binascii

def send_raw(printer, data):
    h = win32print.OpenPrinter(printer)
    try:
        win32print.StartDocPrinter(h, 1, ("TSPL RAW", None, "RAW"))
        win32print.StartPagePrinter(h)
        win32print.WritePrinter(h, data.encode("ascii"))
        win32print.EndPagePrinter(h)
        win32print.EndDocPrinter(h)
    finally:
        win32print.ClosePrinter(h)

# 32 pixels wide x 32 pixels high, 1-bit packed, solid black
width_px, height_px = 32, 32
width_bytes = width_px // 8  # 4
row = b"\xFF" * width_bytes  # black bits (1=black for most TSPL; invert with mode=1 if needed) [web:4]
raw = row * height_px
hex_data = binascii.hexlify(raw).decode("ascii").upper()

tspl = []
tspl.append("SIZE 55 mm,12 mm")
tspl.append("GAP 2 mm,0")
tspl.append("CLS")
tspl.append("DIRECTION 1")
tspl.append("REFERENCE 0,0")
tspl.append(f"BITMAP 20,20,{width_bytes},{height_px},0,{hex_data}")  # mode 0 overwrite [web:4]
tspl.append("PRINT 1,1")
payload = "\n".join(tspl) + "\n"

# Replace with exact printer name
# send_raw("TSC DA210", payload)
print(payload)
