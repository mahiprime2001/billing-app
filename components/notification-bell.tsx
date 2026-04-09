"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Bell, Check, Clock, User, X, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

// Notification types
export interface Notification {
  id: string
  type: "PASSWORD_RESET" | "USER_LOGIN" | "SYSTEM_ALERT" | "RETURN_REQUEST" | "DISCOUNT_REQUEST"
  title?: string
  message: string
  userId?: string
  userName?: string
  userEmail?: string
  isRead: boolean
  createdAt: string
  syncLogId?: number
  _internalKey?: string
  link?: string
  relatedId?: string
  isVirtual?: boolean
}

interface NotificationResponse {
  success?: boolean
  notifications?: Notification[]
  unreadCount?: number
  total?: number
}

type ReturnRequest = {
  returnId?: string
  return_id?: string
  status?: string
  createdAt?: string
  created_at?: string
  customerName?: string
  customer_name?: string
  productName?: string
  product_name?: string
  returnAmount?: number
  return_amount?: number
  createdBy?: string
  created_by?: string
}

type DiscountRequest = {
  discountId?: string
  discount_id?: string
  status?: string
  createdAt?: string
  created_at?: string
  discount?: number
  discountAmount?: number
  discount_amount?: number
  billId?: string
  bill_id?: string
  userName?: string
  user_name?: string
  userId?: string
  user_id?: string
}

const NotificationItem: React.FC<{
  notification: Notification
  onMarkAsRead: (id: string) => void
  onDismiss: (id: string) => void
  onNavigate: (link: string) => void
}> = ({ notification, onMarkAsRead, onDismiss, onNavigate }) => {
  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 1) return "Just now"
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`
    return `${Math.floor(diffInMinutes / 1440)}d ago`
  }

  const getNotificationIcon = () => {
    switch (notification.type) {
      case "PASSWORD_RESET":
        return <User className="h-4 w-4 text-blue-600" />
      case "RETURN_REQUEST":
        return <RefreshCw className="h-4 w-4 text-purple-600" />
      case "DISCOUNT_REQUEST":
        return <RefreshCw className="h-4 w-4 text-purple-600" />
      default:
        return <Bell className="h-4 w-4 text-gray-600" />
    }
  }

  const handleNotificationClick = () => {
    if (notification.link) {
      onNavigate(notification.link)
    }
    if (!notification.isVirtual) {
      onMarkAsRead(notification.id)
    }
  }

  return (
    <div 
      className={`group p-3 hover:bg-accent/50 transition-colors border-l-2 ${!notification.isRead ? 'bg-blue-50/50 border-l-blue-500' : 'border-l-transparent'} ${notification.link ? 'cursor-pointer' : ''}`}
      onClick={handleNotificationClick}
    >
      <div className="flex items-start space-x-3">
        <Avatar className="h-8 w-8 rounded-lg flex-shrink-0">
          <AvatarFallback className="rounded-lg bg-blue-100 text-blue-600 text-xs">
            {notification.userName ? notification.userName.split(' ').map(n => n[0]).join('') : 'NN'}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {getNotificationIcon()}
              <p className="text-sm font-medium text-foreground">
                {notification.title || "Notification"}
              </p>
              {!notification.isRead && (
                <Badge variant="default" className="bg-blue-600 text-xs px-1.5 py-0">
                  New
                </Badge>
              )}
            </div>
            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!notification.isRead && !notification.isVirtual && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 hover:bg-green-100 hover:text-green-600"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMarkAsRead(notification.id)
                  }}
                  title="Mark as read"
                >
                  <Check className="h-3 w-3" />
                </Button>
              )}
              {!notification.isVirtual && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 hover:bg-red-100 hover:text-red-600"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDismiss(notification.id)
                  }}
                  title="Dismiss notification"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
          
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            {notification.message}
          </p>
          
          <div className="flex items-center space-x-2 mt-2">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {getTimeAgo(notification.createdAt)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Polling constants
const BASE_POLL_INTERVAL = 30_000    // 30s normal polling
const MAX_POLL_INTERVAL = 120_000    // 2min max backoff
const BACKOFF_MULTIPLIER = 2

export const NotificationBell: React.FC = () => {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const loginPendingSnapshotRef = useRef<Set<string>>(new Set())
  const activeNewPendingRef = useRef<Set<string>>(new Set())
  const isSnapshotInitializedRef = useRef(false)
  const lastReminderTsRef = useRef(0)

  // Step 4: inFlight guard + AbortController
  const inFlightRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Step 2: exponential backoff state
  const pollIntervalRef = useRef(BASE_POLL_INTERVAL)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const consecutiveErrorsRef = useRef(0)

  const getDefaultTitle = (type: string): string => {
    switch (type) {
      case "RETURN_REQUEST":
        return "Return request"
      case "DISCOUNT_REQUEST":
        return "Discount request"
      case "PASSWORD_RESET":
        return "Password reset"
      case "USER_LOGIN":
        return "User login"
      default:
        return "System alert"
    }
  }

  const getNotificationLink = (type: string): string | undefined => {
    if (type === "RETURN_REQUEST") return "/dashboard/damaged-products"
    if (type === "DISCOUNT_REQUEST") return "/dashboard/discounts"
    return undefined
  }

  const isPendingStatus = (value: unknown) => String(value || "").toLowerCase() === "pending"

  const getPendingReturnId = (item: ReturnRequest) => item.returnId || item.return_id || ""
  const getPendingDiscountId = (item: DiscountRequest) => item.discountId || item.discount_id || ""

  const normalizeNotification = (raw: any): Notification => {
    const id = String(raw.id ?? raw.notificationId ?? crypto.randomUUID())
    const type = String(raw.type || "SYSTEM_ALERT") as Notification["type"]
    const message = String(raw.message || raw.notification || "")
    const userName = raw.userName || raw.user_name || "System"
    const title = raw.title || getDefaultTitle(type)
    const isRead = Boolean(raw.isRead ?? raw.is_read ?? false)
    const createdAt = raw.createdAt || raw.created_at || new Date().toISOString()
    const relatedId = raw.relatedId || raw.related_id
    const link = raw.link || getNotificationLink(type)

    return {
      id,
      type,
      title,
      message,
      userName,
      userId: raw.userId || raw.user_id,
      userEmail: raw.userEmail || raw.user_email,
      isRead,
      createdAt,
      syncLogId: raw.syncLogId || raw.sync_log_id,
      _internalKey: `${id}-${createdAt}`,
      link,
      relatedId,
      isVirtual: false,
    }
  }

  const buildPendingReturnNotification = (item: ReturnRequest): Notification | null => {
    const returnId = getPendingReturnId(item)
    if (!returnId || !isPendingStatus(item.status)) return null

    const customerName = item.customerName || item.customer_name || "customer"
    const productName = item.productName || item.product_name || "product"
    const amount = item.returnAmount ?? item.return_amount
    const amountText = typeof amount === "number" ? ` for ₹${amount.toFixed(2)}` : ""
    const createdAt = item.createdAt || item.created_at || new Date().toISOString()
    const userName = item.createdBy || item.created_by || customerName

    return {
      id: `pending-return-${returnId}`,
      type: "RETURN_REQUEST",
      title: "Pending return request",
      message: `Return ${returnId} for ${productName} by ${customerName}${amountText} is waiting for review.`,
      userName,
      isRead: false,
      createdAt,
      link: "/dashboard/damaged-products",
      relatedId: returnId,
      isVirtual: true,
    }
  }

  const buildPendingDiscountNotification = (item: DiscountRequest): Notification | null => {
    const discountId = getPendingDiscountId(item)
    if (!discountId || !isPendingStatus(item.status)) return null

    const discountPercent = item.discount
    const discountAmount = item.discountAmount ?? item.discount_amount
    const billId = item.billId || item.bill_id
    const userName = item.userName || item.user_name || item.userId || item.user_id || "user"
    const createdAt = item.createdAt || item.created_at || new Date().toISOString()

    const detailParts: string[] = []
    if (typeof discountPercent === "number") detailParts.push(`${discountPercent}%`)
    if (typeof discountAmount === "number") detailParts.push(`₹${discountAmount.toFixed(2)}`)
    const detailText = detailParts.length ? ` (${detailParts.join(", ")})` : ""
    const billText = billId ? ` for bill ${billId}` : ""

    return {
      id: `pending-discount-${discountId}`,
      type: "DISCOUNT_REQUEST",
      title: "Pending discount request",
      message: `Discount ${discountId}${billText}${detailText} by ${userName} is waiting for review.`,
      userName: String(userName),
      isRead: false,
      createdAt,
      link: "/dashboard/discounts",
      relatedId: discountId,
      isVirtual: true,
    }
  }
  
  // Schedule next poll with current interval (handles backoff)
  const scheduleNextPoll = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    pollTimerRef.current = setTimeout(() => {
      // Step 1: skip poll if tab is hidden
      if (document.visibilityState === "visible") {
        fetchNotifications()
      } else {
        scheduleNextPoll() // re-schedule, don't fetch
      }
    }, pollIntervalRef.current)
  }, [])

  // Fetch notifications from API
  const fetchNotifications = useCallback(async (options?: { includePending?: boolean }) => {
    // Step 4: prevent overlapping requests
    if (inFlightRef.current) return
    inFlightRef.current = true

    // Abort any lingering previous request
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    const signal = controller.signal

    try {
      setLoading(true)
      setError(null)

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL

      // Step 3: only fetch returns/discounts for super_admin AND when dropdown is open (or explicitly requested)
      const shouldFetchPending = isSuperAdmin && (options?.includePending ?? false)

      const fetches: Promise<Response>[] = [
        fetch(backendUrl + "/api/notifications?limit=50", { cache: "no-store", signal }),
      ]
      if (shouldFetchPending) {
        fetches.push(
          fetch(backendUrl + "/api/returns?t=" + Date.now(), { cache: "no-store", signal }),
          fetch(backendUrl + "/api/discounts?t=" + Date.now(), { cache: "no-store", signal }),
        )
      }

      const responses = await Promise.all(fetches)
      const notificationsRes = responses[0]

      if (!notificationsRes.ok) {
        throw new Error(`HTTP ${notificationsRes.status}`)
      }

      const notificationData: NotificationResponse | Notification[] = await notificationsRes.json()
      const persistedList = Array.isArray(notificationData) ? notificationData : notificationData.notifications || []
      const persistedNotifications = persistedList.map(normalizeNotification)

      // Only process pending returns/discounts if we fetched them
      const returnsData: ReturnRequest[] = shouldFetchPending && responses[1]?.ok ? await responses[1].json() : []
      const discountsData: DiscountRequest[] = shouldFetchPending && responses[2]?.ok ? await responses[2].json() : []

      const existingKeys = new Set(
        persistedNotifications
          .filter((item) => item.relatedId && (item.type === "RETURN_REQUEST" || item.type === "DISCOUNT_REQUEST"))
          .map((item) => `${item.type}:${item.relatedId}`),
      )

      const pendingNotifications: Notification[] = []
      for (const item of Array.isArray(returnsData) ? returnsData : []) {
        const notification = buildPendingReturnNotification(item)
        if (!notification) continue
        const key = `${notification.type}:${notification.relatedId}`
        if (!existingKeys.has(key)) pendingNotifications.push(notification)
      }

      for (const item of Array.isArray(discountsData) ? discountsData : []) {
        const notification = buildPendingDiscountNotification(item)
        if (!notification) continue
        const key = `${notification.type}:${notification.relatedId}`
        if (!existingKeys.has(key)) pendingNotifications.push(notification)
      }

      const pendingKeys = new Set(
        pendingNotifications
          .filter((item) => item.relatedId)
          .map((item) => `${item.type}:${item.relatedId}`),
      )

      if (!isSnapshotInitializedRef.current) {
        loginPendingSnapshotRef.current = new Set(pendingKeys)
        isSnapshotInitializedRef.current = true
      } else {
        const activeSet = activeNewPendingRef.current
        for (const key of Array.from(activeSet)) {
          if (!pendingKeys.has(key)) {
            activeSet.delete(key)
          }
        }

        let newItemsSinceLogin = 0
        for (const key of Array.from(pendingKeys)) {
          if (!loginPendingSnapshotRef.current.has(key) && !activeSet.has(key)) {
            activeSet.add(key)
            newItemsSinceLogin += 1
          }
        }

        const now = Date.now()
        if (isSuperAdmin && newItemsSinceLogin > 0) {
          toast({
            title: "New pending request",
            description: `${newItemsSinceLogin} new request(s) need approval.`,
          })
          lastReminderTsRef.current = now
        } else if (
          isSuperAdmin &&
          activeSet.size > 0 &&
          now - lastReminderTsRef.current >= 30000
        ) {
          toast({
            title: "Pending requests reminder",
            description: `${activeSet.size} pending request(s) still need approval/rejection.`,
          })
          lastReminderTsRef.current = now
        }
      }

      const normalized = [...pendingNotifications, ...persistedNotifications].sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }).slice(0, 50)

      setNotifications(normalized)
      setUnreadCount(normalized.filter((item) => !item.isRead).length)

      // Step 2: reset backoff on success
      consecutiveErrorsRef.current = 0
      pollIntervalRef.current = BASE_POLL_INTERVAL
    } catch (err) {
      if (signal.aborted) return // don't treat abort as error
      console.error('Error fetching notifications:', err)
      setError('Failed to load notifications')

      // Step 2: exponential backoff on error
      consecutiveErrorsRef.current += 1
      pollIntervalRef.current = Math.min(
        BASE_POLL_INTERVAL * Math.pow(BACKOFF_MULTIPLIER, consecutiveErrorsRef.current),
        MAX_POLL_INTERVAL,
      )
    } finally {
      if (!signal.aborted) {
        setLoading(false)
        inFlightRef.current = false
        scheduleNextPoll()
      }
    }
  }, [isSuperAdmin, scheduleNextPoll])
  
  // Wrapper for onClick handlers (ignores the MouseEvent arg)
  const handleRefreshClick = useCallback(() => {
    fetchNotifications({ includePending: isSuperAdmin })
  }, [fetchNotifications, isSuperAdmin])

  // Step 5: Mark as read — optimistic local update, no refetch
  const markAsRead = async (id: string) => {
    const target = notifications.find((notification) => notification.id === id)
    if (!target || target.isRead) return

    // Optimistic update immediately
    setNotifications(prev =>
      prev.map(notification =>
        notification.id === id ? { ...notification, isRead: true } : notification
      )
    )
    setUnreadCount((prev) => Math.max(0, prev - 1))

    if (target.isVirtual) return

    try {
      const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + `/api/notifications/${id}`, {
        method: 'PUT'
      })
      if (!response.ok) {
        // Revert on failure
        setNotifications(prev =>
          prev.map(notification =>
            notification.id === id ? { ...notification, isRead: false } : notification
          )
        )
        setUnreadCount((prev) => prev + 1)
      }
    } catch (err) {
      console.error('Error marking notification as read:', err)
      // Revert on failure
      setNotifications(prev =>
        prev.map(notification =>
          notification.id === id ? { ...notification, isRead: false } : notification
        )
      )
      setUnreadCount((prev) => prev + 1)
    }
  }

  // Step 5: Dismiss — optimistic local update, no refetch
  const dismissNotification = async (id: string) => {
    const target = notifications.find((n) => n.id === id)
    if (!target) return

    // Optimistic update immediately
    setNotifications(prev => prev.filter(notification => notification.id !== id))
    if (!target.isRead) {
      setUnreadCount(prev => Math.max(0, prev - 1))
    }

    if (target.isVirtual) return

    try {
      const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + `/api/notifications/${id}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        // Revert on failure — add it back
        setNotifications(prev => [...prev, target].sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ))
        if (!target.isRead) setUnreadCount(prev => prev + 1)
      }
    } catch (err) {
      console.error('Error dismissing notification:', err)
      setNotifications(prev => [...prev, target].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ))
      if (!target.isRead) setUnreadCount(prev => prev + 1)
    }
  }

  // Step 5: Mark all as read — optimistic, no refetch
  const markAllAsRead = async () => {
    const previousNotifications = notifications
    const unreadPersistedIds = notifications
      .filter((notification) => !notification.isRead && !notification.isVirtual)
      .map((n) => n.id)

    // Optimistic update immediately
    setNotifications((prev) => {
      const next = prev.map((notification) =>
        notification.isVirtual ? notification : { ...notification, isRead: true },
      )
      setUnreadCount(next.filter((item) => !item.isRead).length)
      return next
    })

    try {
      const results = await Promise.all(
        unreadPersistedIds.map((id) =>
          fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + `/api/notifications/${id}`, {
            method: "PUT",
          }),
        ),
      )
      // If any failed, revert
      if (results.some(r => !r.ok)) {
        setNotifications(previousNotifications)
        setUnreadCount(previousNotifications.filter((item) => !item.isRead).length)
      }
    } catch (err) {
      console.error('Error marking all as read:', err)
      setNotifications(previousNotifications)
      setUnreadCount(previousNotifications.filter((item) => !item.isRead).length)
    }
  }

  // Step 1: Handle dropdown open — fetch with pending data when bell opens
  const handleDropdownOpenChange = useCallback((open: boolean) => {
    setIsDropdownOpen(open)
    if (open) {
      // Fetch with pending returns/discounts when bell is opened
      fetchNotifications({ includePending: isSuperAdmin })
    }
  }, [fetchNotifications, isSuperAdmin])

  // Load notifications on component mount + set up smart polling
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("adminUser") : null
      if (raw) {
        const parsed = JSON.parse(raw)
        setIsSuperAdmin(parsed?.role === "super_admin")
      }
    } catch {
      setIsSuperAdmin(false)
    }

    // Initial fetch — lightweight (no pending returns/discounts)
    fetchNotifications()

    // Step 1: pause/resume polling on tab visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Tab became visible — fetch immediately, then resume polling
        fetchNotifications()
      }
      // When hidden, scheduleNextPoll will skip fetching automatically
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      abortControllerRef.current?.abort()
    }
  }, [])

  return (
    <DropdownMenu onOpenChange={handleDropdownOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative hover:bg-accent">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs min-w-[20px] animate-pulse"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent 
        align="end" 
        className="w-80 max-h-96 overflow-y-auto"
        sideOffset={8}
      >
        <DropdownMenuLabel className="flex items-center justify-between px-3 py-3 bg-blue-50/50">
          <div className="flex items-center space-x-2">
            <Bell className="h-4 w-4 text-blue-600" />
            <span className="font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {unreadCount} new
              </Badge>
            )}
          </div>
          <div className="flex items-center space-x-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefreshClick}
              className="h-7 w-7"
              disabled={loading}
              title="Refresh notifications"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="text-xs h-7 px-2 text-blue-600 hover:bg-blue-100"
              >
                Mark all read
              </Button>
            )}
          </div>
        </DropdownMenuLabel>
        
        <DropdownMenuSeparator />
        
        {loading && notifications.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            <RefreshCw className="h-6 w-6 mx-auto mb-2 animate-spin" />
            <p className="text-sm">Loading notifications...</p>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-600">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium mb-1">Failed to load</p>
            <p className="text-xs">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefreshClick}
              className="mt-2 text-xs"
            >
              Try again
            </Button>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Bell className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm font-medium mb-1">No notifications yet</p>
            <p className="text-xs">You'll see password reset notifications here</p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification._internalKey || notification.id} // Use internal key, fallback to id
                notification={notification}
                onMarkAsRead={markAsRead}
                onDismiss={dismissNotification}
                onNavigate={(link) => router.push(link)}
              />
            ))}
          </div>
        )}
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem className="justify-center text-center py-3 cursor-pointer hover:bg-accent">
          <span className="text-sm text-blue-600 font-medium">View all notifications</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
