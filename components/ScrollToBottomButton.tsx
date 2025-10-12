"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { ArrowDown } from "lucide-react"

interface ScrollToBottomButtonProps {
  onClick: () => void
}

export const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = ({ onClick }) => {
  return (
    <Button
      onClick={onClick}
      className="fixed bottom-8 right-8 p-3 rounded-full shadow-lg bg-blue-600 hover:bg-blue-700 text-white z-50"
      size="icon"
    >
      <ArrowDown className="h-6 w-6" />
    </Button>
  )
}
