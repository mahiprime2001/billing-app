"use client"

import React, { useState, useEffect } from "react"
import { Bell, Check, Clock, User, X, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  type: "PASSWORD_RESET" | "USER_LOGIN" | "SYSTEM_ALERT"
  title: string
  message: string
  userId: string
  userName: string
  userEmail: string
  isRead: boolean
  createdAt: string
  syncLogId: number
}

interface NotificationResponse {
  success: boolean
  notifications: Notification[]
  unreadCount: number
  total: number
}

const NotificationItem: React.FC<{
  notification: Notification
  onMarkAsRead: (id: string) => void
  onDismiss: (id: string) => void
}> = ({ notification, onMarkAsRead, onDismiss }) => {
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
      default:
        return <Bell className="h-4 w-4 text-gray-600" />
    }
  }

  return (
    <div className={`group p-3 hover:bg-accent/50 transition-colors border-l-2 ${!notification.isRead ? 'bg-blue-50/50 border-l-blue-500' : 'border-l-transparent'}`}>
      <div className="flex items-start space-x-3">
        <Avatar className="h-8 w-8 rounded-lg flex-shrink-0">
          <AvatarFallback className="rounded-lg bg-blue-100 text-blue-600 text-xs">
            {notification.userName.split(' ').map(n => n[0]).join('')}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {getNotificationIcon()}
              <p className="text-sm font-medium text-foreground">
                {notification.title}
              </p>
              {!notification.isRead && (
                <Badge variant="default" className="bg-blue-600 text-xs px-1.5 py-0">
                  New
                </Badge>
              )}
            </div>
            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!notification.isRead && (
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
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Fetch notifications from API
  const fetchNotifications = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + '/api/notifications?limit=20')
      const data: NotificationResponse = await response.json()
      
      if (data.success) {
        setNotifications(data.notifications)
        setUnreadCount(data.unreadCount)
      } else {
        setError('Failed to load notifications')
      }
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
        setUnreadCount(prev => Math.max(0, prev - 1))
      }
    } catch (err) {
      console.error('Error marking notification as read:', err)
    }
  }
  
  // Dismiss notification
  const dismissNotification = async (id: string) => {
    try {
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
      const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + '/api/notifications', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'markAllRead' })
      })
      
      if (response.ok) {
        setNotifications(prev => 
          prev.map(notification => ({ ...notification, isRead: true }))
        )
        setUnreadCount(0)
      }
    } catch (err) {
      console.error('Error marking all as read:', err)
    }
  }

  // Load notifications on component mount
  useEffect(() => {
    fetchNotifications()
    
    // Set up polling for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000)
    
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
                key={notification.id}
                notification={notification}
                onMarkAsRead={markAsRead}
                onDismiss={dismissNotification}
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
