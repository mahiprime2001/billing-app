// TSPL for DISCOUNT labels: the usual barcode label, but the price area shows the ORIGINAL price struck
// through, with the DISCOUNTED price beside it (and the "% OFF" tag).
//
// Same printer set-up and the same barcode/columns as lib/tspl-generator.ts (the product-page labels), so the
// label stock, positions and printer behave the same. TSPL has no "strikethrough" text, so the strike is a thin
// BAR drawn through the middle of the original price.
//
// Built-in TSPL fonts (dots per character at 1x): "1" 8x12, "2" 12x20, "3" 16x24, "4" 24x32, "5" 32x48.

const DOTS_PER_MM = 8 // 203 DPI

/** percent = % off, amount = rupees off, final = the new price itself */
export type DiscountMode = "percent" | "amount" | "final"

export interface DiscountResult {
  ok: boolean
  error?: string
  original: number
  final: number
  amountOff: number
  percentOff: number
}

export interface DiscountLabelItem {
  barcode: string
  name: string
  original: number
  final: number
  percentOff: number
  batch?: string
}

export interface DiscountLabelSize {
  widthMm: number
  heightMm: number
}

export interface DiscountLabelProfile {
  type?: string
  paper_width_mm?: number | null
  paper_height_mm?: number | null
  gap_vertical_mm?: number | null
  gap_horizontal_mm?: number | null
  margin_left_mm?: number | null
  label_width_mm?: number | null
  [key: string]: unknown
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** 350 -> "350", 349.5 -> "349.50" */
export function formatMoney(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

/** "12" -> 12, "12.5" -> 12.5, anything else -> NaN */
export function parseNumber(text: string): number {
  const t = String(text ?? "").trim()
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN
}

/**
 * The discounted price from the selling price and a percentage off, rupees off, or the new price itself.
 * `roundWhole` rounds the new price to a whole rupee (the % off shown is then worked out from that price).
 */
export function computeDiscount(original: number, mode: DiscountMode, value: number, roundWhole = false): DiscountResult {
  const empty = { original, final: original, amountOff: 0, percentOff: 0 }
  if (!(original > 0)) return { ok: false, error: "This product has no selling price", ...empty }
  if (!(value > 0)) return { ok: false, error: mode === "final" ? "Enter the new price" : "Enter a discount", ...empty }
  if (mode === "percent" && value >= 100) return { ok: false, error: "A percentage must be below 100", ...empty }
  let final = round2(mode === "percent" ? original * (1 - value / 100) : mode === "amount" ? original - value : value)
  if (roundWhole) final = Math.round(final)
  if (!(final > 0)) return { ok: false, error: "The discount is as big as the price", ...empty }
  if (final >= original) return { ok: false, error: "The new price must be lower than the selling price", ...empty }
  const amountOff = round2(original - final)
  const percentOff = round2((amountOff / original) * 100)
  return { ok: true, original, final, amountOff, percentOff }
}

/** "20% OFF" / "12.5% OFF" */
export function offTag(percentOff: number): string {
  const text = Number.isInteger(percentOff) ? String(percentOff) : percentOff.toFixed(1).replace(/\.0$/, "")
  return `${text}% OFF`
}

// ---------------------------------------------------------------- helpers

const mm = (valueMm: number) => Math.round(valueMm * DOTS_PER_MM)

function formatMm(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
}

function estimateCode128Width(data: string, narrow = 1): number {
  if (!data) return 0
  return ((data.length + 2) * 11 + 13 + 20) * Math.max(1, Math.trunc(narrow))
}

/** TSPL text lives between double quotes: keep the label's own quotes/backslashes/line breaks out of it. */
function safe(text: string): string {
  return String(text ?? "").replace(/["\\]/g, "'").replace(/[\r\n]+/g, " ").trim()
}

const FONT_WIDTH: Record<string, number> = { "1": 8, "2": 12, "3": 16, "4": 24 }
const FONT_HEIGHT: Record<string, number> = { "1": 12, "2": 20, "3": 24, "4": 32 }

/** The biggest of the given fonts whose text still fits in `availableDots`. */
function fitFont(text: string, availableDots: number, fonts: string[]): string {
  for (const f of fonts) if (text.length * FONT_WIDTH[f] <= availableDots) return f
  return fonts[fonts.length - 1]
}

function is25x25(size?: DiscountLabelSize, profile?: DiscountLabelProfile): boolean {
  if (profile?.type === "25x25_4up") return true
  if (size) return Math.abs((size.widthMm || 0) - 25) < 0.5 && Math.abs((size.heightMm || 0) - 25) < 0.5
  return false
}

/** The "original struck through" + "new price" pair, bottom-aligned on `bottom`, starting at x. Returns the lines. */
function priceRow(x: number, bottom: number, availableWidth: number, item: DiscountLabelItem, bigFonts: string[]): string[] {
  const originalText = `Rs.${formatMoney(item.original)}`
  const finalText = `Rs.${formatMoney(item.final)}`
  const originalFont = "2"
  const originalWidth = originalText.length * FONT_WIDTH[originalFont]
  const gap = 14
  const finalFont = fitFont(finalText, availableWidth - originalWidth - gap, bigFonts)
  const originalY = bottom - FONT_HEIGHT[originalFont]
  const finalY = bottom - FONT_HEIGHT[finalFont]
  const strikeY = originalY + Math.round(FONT_HEIGHT[originalFont] / 2) - 1
  return [
    `TEXT ${x},${originalY},"${originalFont}",0,1,1,"${originalText}"`,
    `BAR ${x},${strikeY},${originalWidth},2`,
    `TEXT ${x + originalWidth + gap},${finalY},"${finalFont}",0,1,1,"${finalText}"`,
  ]
}

// ---------------------------------------------------------------- public

export function generateDiscountTspl(
  items: DiscountLabelItem[],
  copies = 1,
  labelSize?: DiscountLabelSize,
  labelProfile?: DiscountLabelProfile,
): string {
  const labels: DiscountLabelItem[] = []
  for (const item of items) for (let i = 0; i < copies; i++) labels.push(item)
  return is25x25(labelSize, labelProfile) ? generate25x25(labels, labelProfile) : generateStandard(labels, labelSize)
}

/** 25 x 25 mm labels, four across a 103 mm roll (same geometry as the product-page 4-up label). */
function generate25x25(labels: DiscountLabelItem[], labelProfile?: DiscountLabelProfile): string {
  const cfg = { paper_width_mm: 103.0, paper_height_mm: 25.0, gap_vertical_mm: 3.0, gap_horizontal_mm: 0.0,
    margin_left_mm: 2.0, label_width_mm: 24.75 }
  if (labelProfile) {
    for (const key of Object.keys(cfg) as (keyof typeof cfg)[]) {
      const v = labelProfile[key]
      if (v !== undefined && v !== null && !Number.isNaN(Number(v))) cfg[key] = Number(v)
    }
  }
  const out: string[] = [
    `SIZE ${formatMm(cfg.paper_width_mm)} mm,${formatMm(cfg.paper_height_mm)} mm`,
    `GAP ${formatMm(cfg.gap_vertical_mm)} mm,0 mm`,
    "DENSITY 8", "SPEED 3", "DIRECTION 1", "SHIFT 0", "REFERENCE 0,0", "SET PEEL OFF", "SET CUTTER OFF", "SET TEAR ON", "CALIBRATE",
  ]
  const labelW = mm(cfg.label_width_mm)
  const gapH = mm(cfg.gap_horizontal_mm)
  const marginL = mm(cfg.margin_left_mm)
  const paperW = mm(cfg.paper_width_mm)
  const slotPitch = labelW + gapH
  const maxCols = slotPitch > 0 ? Math.min(4, Math.max(1, Math.floor((paperW - marginL + gapH) / slotPitch))) : 1
  const columnX = Array.from({ length: maxCols }, (_, i) => marginL + i * slotPitch)
  const innerPad = Math.max(4, mm(0.5))
  const available = labelW - 2 * innerPad

  for (let rowStart = 0; rowStart < labels.length; rowStart += maxCols) {
    out.push("CLS")
    labels.slice(rowStart, rowStart + maxCols).forEach((item, col) => {
      const xOff = columnX[col]
      const tx = xOff + innerPad
      const barcode = safe(item.barcode)
      const bcW = estimateCode128Width(barcode, 1)
      const bcX = xOff + innerPad + Math.max(0, Math.floor((available - bcW) / 2))
      const name = safe(item.name).slice(0, Math.floor(available / FONT_WIDTH["1"]))
      out.push(`BARCODE ${bcX},2,"128",60,0,0,1,1,"${barcode}"`)
      out.push(`TEXT ${tx},64,"1",0,1,1,"${barcode}"`)
      out.push(`TEXT ${tx},78,"1",0,1,1,"${name}"`)
      // original (struck) on its own line, the new price big beneath it, then the % tag
      const originalText = `Rs.${formatMoney(item.original)}`
      const originalW = originalText.length * FONT_WIDTH["2"]
      out.push(`TEXT ${tx},96,"2",0,1,1,"${originalText}"`)
      out.push(`BAR ${tx},105,${originalW},2`)
      const finalText = `Rs.${formatMoney(item.final)}`
      const finalFont = fitFont(finalText, available, ["4", "3", "2"])
      out.push(`TEXT ${tx},122,"${finalFont}",0,1,1,"${finalText}"`)
      out.push(`TEXT ${tx},162,"2",0,1,1,"${offTag(item.percentOff)}"`)
      if (item.batch) out.push(`TEXT ${tx},184,"1",0,1,1,"B:${safe(item.batch)}"`)
    })
    out.push("PRINT 1")
  }
  return out.join("\r\n") + "\r\n"
}

/** Wide labels (80x12 by default, 60x20 ...): barcode on the left, text block on the right (same as the product label). */
function generateStandard(labels: DiscountLabelItem[], labelSize?: DiscountLabelSize): string {
  let widthMm = 80.0
  let heightMm = 12.0
  if (labelSize && labelSize.widthMm > 0 && labelSize.heightMm > 0) {
    widthMm = labelSize.widthMm
    heightMm = labelSize.heightMm
  }
  const widthDots = mm(widthMm)
  const out: string[] = [
    `SIZE ${formatMm(widthMm)} mm,${formatMm(heightMm)} mm`,
    "GAP 4 mm,0 mm",
    "DENSITY 10", "SPEED 2", "DIRECTION 1", "SHIFT 0", "REFERENCE 0,0", "SET PEEL OFF", "SET CUTTER OFF", "SET TEAR ON",
  ]
  const textX = 240
  const available = Math.max(0, widthDots - textX - 6)

  for (const item of labels) {
    const barcode = safe(item.barcode)
    const name = safe(item.name).slice(0, Math.floor(available / FONT_WIDTH["1"]))
    out.push("CLS")
    out.push(`BARCODE 40,0,"128",55,1,0,1,2,"${barcode}"`)
    const tag = item.batch ? `${offTag(item.percentOff)}  ${safe(item.batch)}` : offTag(item.percentOff)
    out.push(`TEXT ${textX},4,"1",0,1,1,"${tag}"`)
    out.push(`TEXT ${textX},24,"1",0,1,1,"${name}"`)
    out.push(...priceRow(textX, 78, available, item, ["4", "3", "2"]))
    out.push("PRINT 1")
  }
  out.push("FEED 0")
  return out.join("\r\n") + "\r\n"
}
