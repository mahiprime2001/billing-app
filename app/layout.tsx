import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppProviders from "@/components/AppProviders";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SIRI Admin Panel - Comprehensive Billing & Management System",
  description:
    "Advanced admin panel with secure login, role-based access, billing system, product management, barcode scanning, and user management capabilities.",
  keywords:
    "admin panel, billing system, inventory management, barcode scanning, user management, role-based access",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className} suppressHydrationWarning={true}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
