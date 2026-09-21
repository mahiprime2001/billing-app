// TSPL (thermal printer command language) label generation -- a faithful
// port of billing-app/backend/utils/print_TSPL.py's generate_tspl and its
// helpers, so label printing works entirely through the Tauri Rust command
// (send_tspl_to_printer) with no Flask sidecar dependency, online or off.
//
// Kept as a direct line-for-line port rather than a "cleaner" rewrite --
// faithfulness to the proven Python original matters more than elegance
// here, since real barcode labels get printed from this output.

const DOTS_PER_MM = 8 // 203 DPI

export interface TsplProduct {
  id?: string
  barcodes?: string
  barcode?: string
  selling_price?: number | string
  sellingPrice?: number | string
  price?: number | string
  name?: string
  batchNumber?: string
}

export interface LabelSize {
  widthMm: number
  heightMm: number
}

export interface LabelProfile {
  type?: string
  paper_width_mm?: number | null
  paper_height_mm?: number | null
  gap_vertical_mm?: number | null
  gap_horizontal_mm?: number | null
  margin_left_mm?: number | null
  label_width_mm?: number | null
  [key: string]: unknown
}

function formatMm(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
}

function mm(valueMm: number): number {
  try {
    return Math.round(valueMm * DOTS_PER_MM)
  } catch {
    return 0
  }
}

function estimateCode128Width(data: string, narrow = 1): number {
  if (!data) return 0
  const modules = (data.length + 2) * 11 + 13 + 20
  return modules * Math.max(1, Math.trunc(narrow))
}

function extractProduct(product: TsplProduct): { barcode: string; name: string; priceText: string; batch: string } {
  const barcodesStr = String(product.barcodes || product.barcode || "")
  const codes = barcodesStr.split(",").map((b) => b.trim()).filter(Boolean)
  const barcode = codes[0] || String(product.id || "")

  // Python uses `or`-chaining here (falls through on 0/""/None too, not
  // just undefined) -- match that exactly with ||, not ?? .
  const sellingRaw = product.selling_price || product.sellingPrice || product.price || 0
  let price = 0
  try {
    price = parseFloat(String(sellingRaw).replace("₹", "").trim()) || 0
  } catch {
    price = 0
  }
  const priceText = formatMm(price)

  const name = String(product.name || "ITEM")
  const batch = String(product.batchNumber || "").trim()

  return { barcode, name, priceText, batch }
}

function is25x25(labelSize?: LabelSize, labelProfile?: LabelProfile): boolean {
  if (labelProfile?.type === "25x25_4up") return true
  if (labelSize) {
    const w = labelSize.widthMm || 0
    const h = labelSize.heightMm || 0
    return Math.abs(w - 25.0) < 0.5 && Math.abs(h - 25.0) < 0.5
  }
  return false
}

export function generateTspl(
  products: TsplProduct[],
  copies = 1,
  _storeName = "Company Name",
  labelSize?: LabelSize,
  labelProfile?: LabelProfile
): string {
  const expanded: TsplProduct[] = []
  for (const p of products) {
    for (let i = 0; i < copies; i++) expanded.push(p)
  }

  if (is25x25(labelSize, labelProfile)) {
    return generate25x25(expanded, labelProfile)
  }
  return generateStandard(expanded, labelSize)
}

function generate25x25(labels: TsplProduct[], labelProfile?: LabelProfile): string {
  const cfg = {
    paper_width_mm: 103.0,
    paper_height_mm: 25.0,
    gap_vertical_mm: 3.0,
    gap_horizontal_mm: 0.0,
    margin_left_mm: 2.0,
    label_width_mm: 24.75, // (103 - 2 - 2) / 4
  }
  if (labelProfile) {
    for (const key of Object.keys(cfg) as (keyof typeof cfg)[]) {
      const v = labelProfile[key]
      // Python's version does `if key in label_profile: float(value)` inside
      // a try/except that swallows a None -> float() TypeError, which
      // amounts to "null falls back to the default" -- match that here.
      if (v !== undefined && v !== null) {
        const n = Number(v)
        if (!Number.isNaN(n)) cfg[key] = n
      }
    }
  }

  const tspl: string[] = []
  tspl.push(`SIZE ${formatMm(cfg.paper_width_mm)} mm,${formatMm(cfg.paper_height_mm)} mm`)
  tspl.push(`GAP ${formatMm(cfg.gap_vertical_mm)} mm,0 mm`)
  for (const cmd of ["DENSITY 8", "SPEED 3", "DIRECTION 1", "SHIFT 0", "REFERENCE 0,0",
    "SET PEEL OFF", "SET CUTTER OFF", "SET TEAR ON", "CALIBRATE"]) {
    tspl.push(cmd)
  }

  const labelW = mm(cfg.label_width_mm)
  const gapH = mm(cfg.gap_horizontal_mm)
  const marginL = mm(cfg.margin_left_mm)
  const paperW = mm(cfg.paper_width_mm)

  const slotPitch = labelW + gapH
  let maxCols = 1
  if (slotPitch > 0) {
    maxCols = Math.min(4, Math.max(1, Math.floor((paperW - marginL + gapH) / slotPitch)))
  }
  const columnX: number[] = []
  for (let i = 0; i < maxCols; i++) columnX.push(marginL + i * slotPitch)

  const innerPad = Math.max(4, mm(0.5))
  const bcY = 2
  const bcH = 60
  const numY = bcY + bcH + 2 // 64
  const nameY = numY + 14 // 78
  const priceY = nameY + 13 // 91
  const batchY = priceY + 13 // 104

  for (let rowStart = 0; rowStart < labels.length; rowStart += maxCols) {
    const row = labels.slice(rowStart, rowStart + maxCols)
    tspl.push("CLS")

    row.forEach((product, col) => {
      const xOff = columnX[col]
      const { barcode, name, priceText, batch } = extractProduct(product)

      const bcW = estimateCode128Width(barcode, 1)
      const available = labelW - 2 * innerPad
      const bcX = xOff + innerPad + Math.max(0, Math.floor((available - bcW) / 2))
      const tx = xOff + innerPad

      tspl.push(`BARCODE ${bcX},${bcY},"128",${bcH},0,0,1,1,"${barcode}"`)
      tspl.push(`TEXT ${tx},${numY},"1",0,1,1,"${barcode}"`)
      tspl.push(`TEXT ${tx},${nameY},"1",0,1,1,"${name}"`)
      tspl.push(`TEXT ${tx},${priceY},"1",0,1,1,"Rs.${priceText}"`)
      if (batch) {
        tspl.push(`TEXT ${tx},${batchY},"1",0,1,1,"B:${batch}"`)
      }
    })

    tspl.push("PRINT 1")
  }

  return tspl.join("\r\n") + "\r\n"
}

function generateStandard(labels: TsplProduct[], labelSize?: LabelSize): string {
  let widthMm = 80.0
  let heightMm = 12.0
  if (labelSize) {
    const w = labelSize.widthMm ?? widthMm
    const h = labelSize.heightMm ?? heightMm
    if (w > 0 && h > 0) {
      widthMm = w
      heightMm = h
    }
  }

  const tspl: string[] = []
  tspl.push(`SIZE ${formatMm(widthMm)} mm,${formatMm(heightMm)} mm`)
  tspl.push("GAP 4 mm,0 mm")
  for (const cmd of ["DENSITY 10", "SPEED 2", "DIRECTION 1", "SHIFT 0", "REFERENCE 0,0",
    "SET PEEL OFF", "SET CUTTER OFF", "SET TEAR ON"]) {
    tspl.push(cmd)
  }

  for (const product of labels) {
    const { barcode, name, priceText, batch } = extractProduct(product)

    tspl.push("CLS")
    tspl.push(`BARCODE 40,0,"128",55,1,0,1,2,"${barcode}"`)
    let py: number
    if (batch) {
      tspl.push(`TEXT 240,6,"1",0,1,1,"${batch}"`)
      py = 54
    } else {
      py = 44
    }
    tspl.push(`TEXT 240,30,"1",0,1,1,"${name}"`)
    tspl.push(`TEXT 240,${py},"2",0,1,1,"MRP.${priceText}"`)
    tspl.push("PRINT 1")
  }

  tspl.push("FEED 0")
  return tspl.join("\r\n") + "\r\n"
}
