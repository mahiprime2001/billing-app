"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Store, Settings, LogOut, LayoutDashboard, History, Receipt, UserX, Clock, AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface AdminUser {
  name: string
  email: string
  role: "super_admin" | "billing_user" | "temporary_user"
  assignedStores?: string[]
  isTemporary?: boolean
  sessionId?: string
  createdAt?: string
}

interface SystemStore {
  id: string
  name: string
  address: string
  status: string
}

interface TempSession {
  sessionId: string
  startTime: string
  expiresAt: string
}

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<AdminUser | null>(null)
  const [assignedStores, setAssignedStores] = useState<SystemStore[]>([])
  const [sessionTimeLeft, setSessionTimeLeft] = useState<string>("")
  const [showSessionWarning, setShowSessionWarning] = useState(false)

  useEffect(() => {
    const userData = localStorage.getItem("adminUser")
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)

      // Check temporary session validity
      if (parsedUser.isTemporary) {
        checkTemporarySessionValidity(parsedUser)
        startSessionTimer()
      }

      // Load assigned stores for billing users
      if (parsedUser.role === "billing_user" && parsedUser.assignedStores) {
        const savedStores = localStorage.getItem("stores")
        if (savedStores) {
          const allStores = JSON.parse(savedStores)
          const userStores = allStores.filter(
            (store: SystemStore) => parsedUser.assignedStores?.includes(store.id) && store.status === "active",
          )
          setAssignedStores(userStores)
        }
      }
    }
  }, [])

  const checkTemporarySessionValidity = (tempUser: AdminUser) => {
    const sessionData = localStorage.getItem("tempUserSession")
    if (sessionData) {
      const session: TempSession = JSON.parse(sessionData)
      const expiresAt = new Date(session.expiresAt)
      const now = new Date()

      if (now >= expiresAt) {
        // Session expired, force cleanup and logout
        handleTemporarySessionExpiry()
        return
      }

      // Check if session is expiring soon (within 1 hour)
      const timeLeft = expiresAt.getTime() - now.getTime()
      const hoursLeft = timeLeft / (1000 * 60 * 60)

      if (hoursLeft <= 1) {
        setShowSessionWarning(true)
      }
    } else {
      // No session data found, create it
      const newSession: TempSession = {
        sessionId: tempUser.sessionId || Date.now().toString(),
        startTime: tempUser.createdAt || new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }
      localStorage.setItem("tempUserSession", JSON.stringify(newSession))
    }
  }

  const startSessionTimer = () => {
    const updateTimer = () => {
      const sessionData = localStorage.getItem("tempUserSession")
      if (sessionData) {
        const session: TempSession = JSON.parse(sessionData)
        const expiresAt = new Date(session.expiresAt)
        const now = new Date()
        const timeLeft = expiresAt.getTime() - now.getTime()

        if (timeLeft <= 0) {
          handleTemporarySessionExpiry()
          return
        }

        const hours = Math.floor(timeLeft / (1000 * 60 * 60))
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60))

        setSessionTimeLeft(`${hours}h ${minutes}m`)

        // Show warning if less than 1 hour left
        if (timeLeft <= 60 * 60 * 1000) {
          setShowSessionWarning(true)
        }
      }
    }

    // Update immediately and then every minute
    updateTimer()
    const interval = setInterval(updateTimer, 60000)

    // Cleanup interval on unmount
    return () => clearInterval(interval)
  }

  const handleTemporarySessionExpiry = () => {
    alert("Your guest session has expired. You will be redirected to the login page.")
    performComprehensiveCleanup()
    router.push("/")
  }

  const performComprehensiveCleanup = () => {
    console.log("Starting comprehensive session cleanup...")

    // List all keys that should be cleaned up for temporary users
    const tempUserKeys = [
      // Authentication
      "adminLoggedIn",
      "adminUser",

      // Temporary session data
      "tempUserSession",
      "tempUserSelectedStore",

      // Temporary user preferences and data
      "tempUserCart",
      "tempUserPreferences",
      "tempUserDraft",
      "tempUserSettings",

      // Any cached data that might be user-specific
      "tempUserLastActivity",
      "tempUserBillingDraft",
      "tempUserCustomerData",
    ]

    // Remove all temporary user related data
    tempUserKeys.forEach((key) => {
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key)
        console.log(`Cleaned up: ${key}`)
      }
    })

    // Clear any session storage as well
    if (typeof sessionStorage !== "undefined") {
      const sessionKeys = ["tempUserState", "tempUserActivity", "guestSessionData"]

      sessionKeys.forEach((key) => {
        if (sessionStorage.getItem(key)) {
          sessionStorage.removeItem(key)
          console.log(`Cleaned up session: ${key}`)
        }
      })
    }

    // Clear any temporary data from memory
    setUser(null)
    setAssignedStores([])
    setSessionTimeLeft("")
    setShowSessionWarning(false)

    console.log("Comprehensive cleanup completed")
  }

  const handleLogout = () => {
    const confirmMessage = user?.isTemporary
      ? "Are you sure you want to end your guest session? Any unsaved data will be lost."
      : "Are you sure you want to logout?"

    if (confirm(confirmMessage)) {
      if (user?.isTemporary) {
        console.log("Ending temporary user session...")
        performComprehensiveCleanup()
      } else {
        // Regular user logout - only remove auth data
        localStorage.removeItem("adminLoggedIn")
        localStorage.removeItem("adminUser")
      }

      router.push("/")
    }
  }

  const extendGuestSession = () => {
    if (user?.isTemporary) {
      const newExpiryTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      const sessionData = localStorage.getItem("tempUserSession")

      if (sessionData) {
        const session: TempSession = JSON.parse(sessionData)
        session.expiresAt = newExpiryTime
        localStorage.setItem("tempUserSession", JSON.stringify(session))

        setShowSessionWarning(false)
        alert("Guest session extended for another 24 hours!")

        // Restart the timer
        startSessionTimer()
      }
    }
  }

  const getUserRoleDisplay = () => {
    if (user?.isTemporary) return "Guest User"
    if (user?.role === "super_admin") return "Super Admin"
    if (user?.role === "billing_user") return "Billing User"
    return "User"
  }

  const getUserRoleBadgeVariant = () => {
    if (user?.isTemporary) return "secondary"
    if (user?.role === "super_admin") return "default"
    return "secondary"
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Session Warning for Temporary Users */}
      {showSessionWarning && user?.isTemporary && (
        <Alert className="m-4 border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-700 flex items-center justify-between">
            <span>
              <strong>Session Expiring Soon:</strong> Your guest session will expire in {sessionTimeLeft}. Extend now to
              avoid losing your work.
            </span>
            <Button
              size="sm"
              onClick={extendGuestSession}
              className="ml-4 bg-orange-600 hover:bg-orange-700 text-white"
            >
              Extend Session
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Top Navigation Bar */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and Brand */}
            <div className="flex items-center space-x-4">
              <Link href="/billing" className="flex items-center space-x-3">
                <div className="flex items-center justify-center w-10 h-10 bg-blue-600 rounded-lg">
                  <Store className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">SIRI ART JEWELLERY</h1>
                  <p className="text-xs text-gray-500">
                    {user?.isTemporary ? "Guest Billing System" : "Billing System"}
                  </p>
                </div>
              </Link>
            </div>

            {/* Navigation Links */}
            <div className="flex items-center space-x-4">
              <Link href="/billing">
                <Button variant="ghost" className="flex items-center space-x-2">
                  <Receipt className="w-4 h-4" />
                  <span>Billing</span>
                </Button>
              </Link>

              <Link href="/billing/history">
                <Button variant="ghost" className="flex items-center space-x-2">
                  <History className="w-4 h-4" />
                  <span>History</span>
                </Button>
              </Link>

              {/* Dashboard link for super admin only */}
              {user?.role === "super_admin" && (
                <Link href="/dashboard">
                  <Button variant="ghost" className="flex items-center space-x-2">
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Dashboard</span>
                  </Button>
                </Link>
              )}
            </div>

            {/* User Menu */}
            <div className="flex items-center space-x-4">
              {/* Store Info for Billing Users */}
              {user?.role === "billing_user" && assignedStores.length > 0 && (
                <div className="hidden md:block">
                  <div className="text-sm text-gray-600">
                    <div className="font-medium">
                      {assignedStores.length === 1 ? assignedStores[0].name : `${assignedStores.length} Stores`}
                    </div>
                    <div className="text-xs text-gray-500">Assigned Locations</div>
                  </div>
                </div>
              )}

              {/* Temporary User Session Info */}
              {user?.isTemporary && (
                <div className="hidden md:flex items-center space-x-2 px-3 py-1 bg-orange-50 rounded-lg border border-orange-200">
                  <Clock className="w-4 h-4 text-orange-600" />
                  <div className="text-sm">
                    <div className="font-medium text-orange-700">Guest Session</div>
                    <div className="text-xs text-orange-600">
                      {sessionTimeLeft ? `${sessionTimeLeft} left` : "Active"}
                    </div>
                  </div>
                </div>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback
                        className={`${user?.isTemporary ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600"}`}
                      >
                        {user?.isTemporary ? "G" : user?.name?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-2">
                      <div className="flex items-center space-x-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback
                            className={`${user?.isTemporary ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600"}`}
                          >
                            {user?.isTemporary ? "G" : user?.name?.charAt(0) || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="text-sm font-medium leading-none">{user?.name}</p>
                          <p className="text-xs leading-none text-muted-foreground mt-1">{user?.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Badge variant={getUserRoleBadgeVariant()}>{getUserRoleDisplay()}</Badge>
                        {user?.role === "billing_user" && assignedStores.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {assignedStores.length} Store{assignedStores.length !== 1 ? "s" : ""}
                          </Badge>
                        )}
                        {user?.isTemporary && (
                          <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                            {sessionTimeLeft || "Active"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  <DropdownMenuItem asChild>
                    <Link href="/billing/history" className="flex items-center">
                      <History className="mr-2 h-4 w-4" />
                      <span>Billing History</span>
                    </Link>
                  </DropdownMenuItem>

                  {user?.role === "super_admin" && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href="/dashboard" className="flex items-center">
                          <LayoutDashboard className="mr-2 h-4 w-4" />
                          <span>Dashboard</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/dashboard/settings" className="flex items-center">
                          <Settings className="mr-2 h-4 w-4" />
                          <span>Settings</span>
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}

                  {user?.isTemporary && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={extendGuestSession}>
                        <Clock className="mr-2 h-4 w-4 text-orange-600" />
                        <span>Extend Session (+24h)</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled className="text-orange-600">
                        <UserX className="mr-2 h-4 w-4" />
                        <span>Guest Session - Limited Access</span>
                      </DropdownMenuItem>
                    </>
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>{user?.isTemporary ? "End Session" : "Log out"}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">{children}</main>
    </div>
  )
}
