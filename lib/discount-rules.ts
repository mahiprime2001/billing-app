// Discount rules ("X% / Rs. X off these products, in these stores, between these dates").
// Types + pure helpers for the admin page; the data lives in siri-api (routes/discount_rules.py).
// Nothing here touches the network or the DOM, so it can be checked on its own.

import { format, parseISO } from "date-fns"

export type DiscountType = "percent" | "amount"
export type RuleStatus = "active" | "scheduled" | "expired" | "paused"

// A rule as the API returns it.
export interface DiscountRule {
  id: string
  name: string
  discountType: DiscountType
  value: number
  // null = every product / every store
  productIds: string[] | null
  storeIds: string[] | null
  startsAt: string | null
  endsAt: string | null
  active: boolean
  status: RuleStatus
  createdBy?: string | null
  createdAt?: string
  updatedAt?: string
}

// What the create/edit dialog edits. Dates are yyyy-MM-dd text from <input type="date">.
export interface RuleForm {
  name: string
  discountType: DiscountType
  value: string
  allProducts: boolean
  productIds: string[]
  allStores: boolean
  storeIds: string[]
  startDate: string
  endDate: string
  active: boolean
}

export const emptyForm = (): RuleForm => ({
  name: "",
  discountType: "percent",
  value: "",
  allProducts: false,
  productIds: [],
  allStores: true,
  storeIds: [],
  startDate: "",
  endDate: "",
  active: true,
})

export const formFromRule = (rule: DiscountRule): RuleForm => ({
  name: rule.name,
  discountType: rule.discountType,
  value: String(rule.value),
  allProducts: !rule.productIds || rule.productIds.length === 0,
  productIds: rule.productIds ?? [],
  allStores: !rule.storeIds || rule.storeIds.length === 0,
  storeIds: rule.storeIds ?? [],
  startDate: isoToDateInput(rule.startsAt),
  endDate: isoToDateInput(rule.endsAt),
  active: rule.active,
})

/** ISO timestamp -> the local yyyy-MM-dd the date box shows ("" if none/invalid). */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return ""
  try {
    const parsed = parseISO(iso)
    return Number.isNaN(parsed.getTime()) ? "" : format(parsed, "yyyy-MM-dd")
  } catch {
    return ""
  }
}

/** A start date means the beginning of that local day. */
export const startOfDayIso = (date: string): string | null =>
  date ? new Date(`${date}T00:00:00`).toISOString() : null

/** An end date means the last second of that local day, so "ends 10 Nov" includes the 10th. */
export const endOfDayIso = (date: string): string | null =>
  date ? new Date(`${date}T23:59:59`).toISOString() : null

/** Returns a message for the first problem, or null when the form can be saved. */
export function validateForm(form: RuleForm): string | null {
  if (!form.name.trim()) return "Give the discount a name."
  if (form.name.trim().length > 120) return "The name is too long (120 characters at most)."
  const value = Number(form.value)
  if (!form.value.trim() || !Number.isFinite(value) || value <= 0) return "Enter a discount greater than 0."
  if (form.discountType === "percent" && value > 100) return "A percentage can't be more than 100."
  if (!form.allProducts && form.productIds.length === 0) return "Pick at least one product, or choose All products."
  if (!form.allStores && form.storeIds.length === 0) return "Pick at least one store, or choose All stores."
  if (form.startDate && form.endDate && form.endDate < form.startDate) return "The end date must be on or after the start date."
  return null
}

/** The body to send to the API (call validateForm first). */
export function buildPayload(form: RuleForm, createdBy?: string) {
  return {
    name: form.name.trim(),
    discountType: form.discountType,
    value: Number(form.value),
    productIds: form.allProducts ? null : form.productIds,
    storeIds: form.allStores ? null : form.storeIds,
    startsAt: startOfDayIso(form.startDate),
    endsAt: endOfDayIso(form.endDate),
    active: form.active,
    ...(createdBy ? { createdBy } : {}),
  }
}

const trimNumber = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))))

/** "10% off" / "₹50 off each". */
export const describeDiscount = (type: DiscountType, value: number): string =>
  type === "percent" ? `${trimNumber(value)}% off` : `₹${trimNumber(value)} off each`

const day = (iso: string) => {
  try {
    return format(parseISO(iso), "dd MMM yyyy")
  } catch {
    return iso
  }
}

/** "Always" / "From 05 Nov 2026" / "Until 10 Nov 2026" / "05 Nov 2026 – 10 Nov 2026". */
export function describeValidity(startsAt: string | null | undefined, endsAt: string | null | undefined): string {
  if (startsAt && endsAt) return `${day(startsAt)} – ${day(endsAt)}`
  if (startsAt) return `From ${day(startsAt)}`
  if (endsAt) return `Until ${day(endsAt)}`
  return "Always"
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Short summary of what a rule covers, e.g. "3 products · 2 stores". */
export function describeScope(productIds: string[] | null, storeIds: string[] | null): string {
  const products = !productIds || productIds.length === 0 ? "All products" : plural(productIds.length, "product", "products")
  const stores = !storeIds || storeIds.length === 0 ? "all stores" : plural(storeIds.length, "store", "stores")
  return `${products} · ${stores}`
}

/** Names for an id list ("Soap, Rice +3 more"); unknown ids are counted, not shown as raw ids. */
export function namesPreview(ids: string[], nameById: Map<string, string>, show = 2): string {
  const known = ids.map((id) => nameById.get(id)).filter((n): n is string => !!n)
  const removed = ids.length - known.length
  const shown = known.slice(0, show)
  const hiddenKnown = known.length - shown.length
  if (shown.length === 0) return plural(ids.length, "item", "items")
  return `${shown.join(", ")}${hiddenKnown > 0 ? ` +${hiddenKnown} more` : ""}${removed > 0 ? ` (+${removed} removed)` : ""}`
}

/** Price after one rule (never below 0). Used for the preview in the dialog. */
export function discountedPrice(price: number, type: DiscountType, value: number): number {
  const cut = type === "percent" ? (price * value) / 100 : value
  return Math.max(0, Math.round((price - cut) * 100) / 100)
}

export const STATUS_LABEL: Record<RuleStatus, string> = {
  active: "Active",
  scheduled: "Scheduled",
  expired: "Expired",
  paused: "Paused",
}
