// Shared app-wide date formatting.
// Display format: "APR 5th 2026" — uppercase short month, ordinal day, year.

/** Resolve a value (Date | string | number | record) to a valid Date, or null. */
export const toValidDate = (value: unknown): Date | null => {
  if (value == null || value === "") return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  // Allow passing a bill/record-like object that may carry the date under
  // several different field names.
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    const raw =
      obj.date ??
      obj.createdAt ??
      obj.created_at ??
      obj.createdat ??
      obj.timestamp ??
      obj.billDate ??
      obj.bill_date ??
      obj.updatedAt ??
      obj.updated_at
    return raw != null ? toValidDate(raw) : null
  }
  const parsed = new Date(value as string | number)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** "st" / "nd" / "rd" / "th" suffix for a day-of-month. */
export const ordinalSuffix = (day: number): string => {
  if (day % 100 >= 11 && day % 100 <= 13) return "th"
  switch (day % 10) {
    case 1:
      return "st"
    case 2:
      return "nd"
    case 3:
      return "rd"
    default:
      return "th"
  }
}

/**
 * Format a date as "APR 5th 2026".
 * Returns `fallback` (default "—") when the value can't be parsed.
 */
export const formatDisplayDate = (value: unknown, fallback = "—"): string => {
  const date = toValidDate(value)
  if (!date) return fallback
  const month = date.toLocaleString("en-US", { month: "short" }).toUpperCase()
  const day = date.getDate()
  return `${month} ${day}${ordinalSuffix(day)} ${date.getFullYear()}`
}

/**
 * Format a date with time as "APR 5th 2026, 9:26 PM".
 * Returns `fallback` (default "—") when the value can't be parsed.
 */
export const formatDisplayDateTime = (value: unknown, fallback = "—"): string => {
  const date = toValidDate(value)
  if (!date) return fallback
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
  return `${formatDisplayDate(date)}, ${time}`
}
