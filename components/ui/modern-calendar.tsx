"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"

interface ModernCalendarProps {
  selected?: Date
  onSelect?: (date: Date) => void
  datesWithProducts?: Date[]
}

export function ModernCalendar({
  selected,
  onSelect,
  datesWithProducts = [],
}: ModernCalendarProps) {
  const isProductDay = (date: Date) =>
    datesWithProducts.some(d => d.toDateString() === date.toDateString())

  return (
    <Calendar
      mode="single"
      selected={selected}
      onSelect={(date) => {
        if (date) onSelect?.(date)
      }}
      modifiers={{
        hasProducts: (date: Date) => isProductDay(date),
      }}
      modifiersClassNames={{
        hasProducts: cn(
          "bg-blue-100 text-blue-800 font-semibold border border-blue-300 rounded-md"
        ),
      }}
      classNames={{
        day: cn(
          "cursor-pointer transition-colors text-gray-700 hover:bg-gray-100"
        ),
      }}
    />
  )
}
