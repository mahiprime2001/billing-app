import type { Metadata } from "next";
import { Inter } from "next/font/google";
import IdleTimeoutHandler from "@/components/idle-timeout-handler";
import "./globals.css";
import OfflineBanner from "@/components/OfflineBanner";
import ServerErrorHandler from "@/components/server-error-handler";
import Updater from "@/components/Updater"; // New import for updater component
import packageJson from "../package.json"; // Import package.json

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "SIRI Admin Panel - Comprehensive Billing & Management System",
  description:
    "Advanced admin panel with secure login, role-based access, billing system, product management, barcode scanning, and user management capabilities.",
  keywords: "admin panel, billing system, inventory management, barcode scanning, user management, role-based access",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Updater /> {/* Render updater early for on-load checks */}
        <OfflineBanner />
        <IdleTimeoutHandler />
        <ServerErrorHandler>{children}</ServerErrorHandler>
        <div className="app-version-watermark">v{packageJson.version}</div>
      </body>
    </html>
  );
}
