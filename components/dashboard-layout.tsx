"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import Logo from "@/public/Logo.png"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  LayoutDashboard,
  Package,
  Users,
  Store,
  BarChart3,
  Receipt,
  Settings,
  LogOut,
  History,
  RefreshCcw,
  Undo2, // Added for Returns icon
  Percent,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { NotificationBell } from "@/components/notification-bell"

interface AdminUser {
  name: string
  email: string
  role: "super_admin" | "billing_user"
  assignedStores?: string[]
}

interface SystemStore {
  id: string
  name: string
  address: string
  status: string
}

type MenuItem = {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
}

const menuItems: MenuItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Products", url: "/dashboard/products", icon: Package },
  { title: "Users", url: "/dashboard/users", icon: Users },
  { title: "Stores", url: "/dashboard/stores", icon: Store },
  { title: "Analytics", url: "/dashboard/analytics", icon: BarChart3 },
  { title: "Billing", url: "/dashboard/billing", icon: Receipt },
  { title: "Damaged Stock", url: "/dashboard/damaged-products", icon: Undo2 },
  { title: "Discounts", url: "/dashboard/discounts", icon: Percent },
  { title: "Settings", url: "/dashboard/settings", icon: Settings },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  const [user, setUser] = useState<AdminUser | null>(null)
  const [assignedStores, setAssignedStores] = useState<SystemStore[]>([])
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    const userData = typeof window !== "undefined" ? localStorage.getItem("adminUser") : null
    if (!userData) {
      router.push("/")
      return
    }
    try {
      const parsedUser: AdminUser = JSON.parse(userData)
      setUser(parsedUser)

      if (parsedUser.role === "billing_user" && parsedUser.assignedStores?.length) {
        const savedStores = localStorage.getItem("stores")
        if (savedStores) {
          const allStores: SystemStore[] = JSON.parse(savedStores)
          const userStores = allStores.filter(
            (store) =>
              parsedUser.assignedStores?.includes(store.id) && store.status === "active",
          )
          setAssignedStores(userStores)
        }
      }
    } catch (error) {
      console.error("Error parsing user data from localStorage:", error)
      localStorage.removeItem("adminLoggedIn")
      localStorage.removeItem("adminUser")
      router.push("/")
    }
  }, [router])

  const pageTitle = useMemo(() => {
    const direct = menuItems.find((m) => m.url === pathname)?.title
    if (direct) return direct
    const parent = menuItems.find((m) => pathname?.startsWith(m.url))
    return parent?.title ?? "Admin Panel"
  }, [pathname])

  const handleLogout = () => {
    if (confirm("Are you sure you want to logout?")) {
      localStorage.removeItem("adminLoggedIn")
      localStorage.removeItem("adminUser")
      router.push("/")
    }
  }

  const handleSync = async () => {
    if (!confirm("Are you sure you want to sync data from MySQL to JSON files? This might take a while.")) {
      return
    }
    setIsSyncing(true)
    try {
      const response = await fetch("/api/sync-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const result = await response.json()
      alert(result.message ?? "Sync completed.")
    } catch (err) {
      console.error("Error syncing data:", err)
      alert("Failed to sync data. Please check the console for more details.")
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="px-3 py-2">
            <Image
              src={Logo}
              alt="SIRI ART JEWELLERY Logo"
              className="h-20 w-auto"
              sizes="96px"
              priority
            />
            <div className="text-xs text-muted-foreground">Admin Panel</div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {menuItems.map((item) => {
                  const Icon = item.icon
                  const active = pathname?.startsWith(item.url)
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={!!active}>
                        <Link href={item.url}>
                          <Icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className="px-2 pb-2">
            <DropdownMenu>
              <DropdownMenuTrigger className="w-full">
                <div className="flex w-full items-center gap-2 rounded-md border px-2 py-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback>{user?.name?.charAt(0) || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{user?.name || "User"}</div>
                    <div className="truncate text-xs text-muted-foreground">{user?.email || ""}</div>
                  </div>
                </div>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>
                  <div className="flex items-center justify-between">
                    <span>Account</span>
                    <Badge variant="secondary">
                      {(user?.role || "user").replace("_", " ")}
                    </Badge>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/billing">
                    <Receipt className="mr-2 h-4 w-4" />
                    <span>Billing System</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/billing/history">
                    <History className="mr-2 h-4 w-4" />
                    <span>Billing History</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSync} disabled={isSyncing}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  <span>{isSyncing ? "Syncing..." : "Sync Data"}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0 w-full">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger />
          <div className="flex-1 text-sm font-medium">{pageTitle}</div>

          {user?.role === "billing_user" && assignedStores.length > 0 && (
            <div className="hidden items-center gap-1 md:flex">
              {assignedStores.map((s) => (
                <Badge key={s.id} variant="outline">
                  {s.name}
                </Badge>
              ))}
            </div>
          )}

          <NotificationBell />

        </header>

        <main className="p-4 min-w-0 w-full">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
