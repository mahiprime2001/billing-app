"use client"

import React, { useState, useEffect, useRef } from "react"
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

export const NotificationBell: React.FC = () => {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const loginPendingSnapshotRef = useRef<Set<string>>(new Set())
  const activeNewPendingRef = useRef<Set<string>>(new Set())
  const isSnapshotInitializedRef = useRef(false)
  const lastReminderTsRef = useRef(0)

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
    if (type === "RETURN_REQUEST") return "/dashboard/returns"
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
      link: "/dashboard/returns",
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
  
  // Fetch notifications from API
  const fetchNotifications = async () => {
    try {
      setLoading(true)
      setError(null)

      const [notificationsRes, returnsRes, discountsRes] = await Promise.all([
        fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/notifications?limit=50", { cache: "no-store" }),
        fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/returns?t=" + Date.now(), { cache: "no-store" }),
        fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/discounts?t=" + Date.now(), { cache: "no-store" }),
      ])

      if (!notificationsRes.ok) {
        throw new Error(`HTTP ${notificationsRes.status}`)
      }

      const notificationData: NotificationResponse | Notification[] = await notificationsRes.json()
      const persistedList = Array.isArray(notificationData) ? notificationData : notificationData.notifications || []
      const persistedNotifications = persistedList.map(normalizeNotification)

      const returnsData: ReturnRequest[] = returnsRes.ok ? await returnsRes.json() : []
      const discountsData: DiscountRequest[] = discountsRes.ok ? await discountsRes.json() : []

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
    } catch (err) {
      console.error('Error fetching notifications:', err)
      setError('Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }
  
  // Mark notification as read
  const markAsRead = async (id: string) => {
    try {
      const target = notifications.find((notification) => notification.id === id)
      if (target?.isVirtual) {
        setNotifications(prev =>
          prev.map(notification =>
            notification.id === id
              ? { ...notification, isRead: true }
              : notification
          )
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
        return
      }

      const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + `/api/notifications/${id}`, {
        method: 'PUT'
      })
      
      if (response.ok) {
        setNotifications(prev => 
          prev.map(notification => 
            notification.id === id 
              ? { ...notification, isRead: true }
              : notification
          )
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
      }
    } catch (err) {
      console.error('Error marking notification as read:', err)
    }
  }
  
  // Dismiss notification
  const dismissNotification = async (id: string) => {
    try {
      const target = notifications.find((n) => n.id === id)
      if (target?.isVirtual) {
        setNotifications(prev => prev.filter(notification => notification.id !== id))
        setUnreadCount(prev => Math.max(0, prev - 1))
        return
      }

      const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + `/api/notifications/${id}`, {
        method: 'DELETE'
      })
      
      if (response.ok) {
        const dismissedNotification = notifications.find(n => n.id === id)
        setNotifications(prev => prev.filter(notification => notification.id !== id))
        
        if (dismissedNotification && !dismissedNotification.isRead) {
          setUnreadCount(prev => Math.max(0, prev - 1))
        }
      }
    } catch (err) {
      console.error('Error dismissing notification:', err)
    }
  }
  
  // Mark all as read
  const markAllAsRead = async () => {
    try {
      const unreadPersistedIds = notifications
        .filter((notification) => !notification.isRead && !notification.isVirtual)
        .map((n) => n.id)
      await Promise.all(
        unreadPersistedIds.map((id) =>
          fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + `/api/notifications/${id}`, {
            method: "PUT",
          }),
        ),
      )
      setNotifications((prev) => {
        const next = prev.map((notification) =>
          notification.isVirtual ? notification : { ...notification, isRead: true },
        )
        setUnreadCount(next.filter((item) => !item.isRead).length)
        return next
      })
    } catch (err) {
      console.error('Error marking all as read:', err)
    }
  }

  // Load notifications on component mount
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

    fetchNotifications()
    
    // Continuously poll for pending requests + notifications.
    const interval = setInterval(fetchNotifications, 10000)
    
    return () => clearInterval(interval)
  }, [])

  return (
    <DropdownMenu>
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
              onClick={fetchNotifications}
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
              onClick={fetchNotifications}
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
