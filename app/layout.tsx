import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import IdleTimeoutHandler from "@/components/idle-timeout-handler"
import "./globals.css"
import OfflineBanner from "@/components/OfflineBanner";

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "SIRI Admin Panel - Comprehensive Billing & Management System",
  description:
    "Advanced admin panel with secure login, role-based access, billing system, product management, barcode scanning, and user management capabilities.",
  keywords: "admin panel, billing system, inventory management, barcode scanning, user management, role-based access",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <OfflineBanner />
        <IdleTimeoutHandler />
        {children}
      </body>
    </html>
  )
}
