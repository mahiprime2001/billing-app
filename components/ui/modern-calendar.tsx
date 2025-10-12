"use client"

import * as React from "react"
import DatePicker from "react-datepicker"
import { registerLocale } from "react-datepicker"
import {enUS} from "date-fns/locale/en-US"
import "react-datepicker/dist/react-datepicker.css"
import { cn } from "@/lib/utils"
import "./react-datepicker-custom.css"

registerLocale("en-US", enUS)

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
  const [startDate, setStartDate] = React.useState<Date | null>(selected || null)

  React.useEffect(() => {
    setStartDate(selected || null)
  }, [selected])

  const isProductDay = (date: Date) =>
    datesWithProducts.some(d => d.toDateString() === date.toDateString())

  return (
    <DatePicker
      selected={startDate}
      onChange={(date) => {
        if (date instanceof Date) {
          setStartDate(date)
          onSelect?.(date)
        }
      }}
      locale="en-US"
      inline
      calendarClassName="react-datepicker-tailwind"
      showYearDropdown
      dropdownMode="select"
      yearDropdownItemNumber={15}
      dayClassName={(date) =>
        cn(
          "cursor-pointer transition-colors",
          isProductDay(date)
            ? "bg-blue-100 text-blue-800 font-semibold border border-blue-300 rounded-md"
            : "text-gray-700 hover:bg-gray-100",
          date.toDateString() === new Date().toDateString() && "react-datepicker__day--today",
        )
      }
    />
  )
}
