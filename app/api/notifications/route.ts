import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const NOTIFICATIONS_FILE = path.join(process.cwd(), 'app', 'data', 'json', 'notifications.json');

interface Notification {
  id: string;
  type: 'PASSWORD_RESET';
  title: string;
  message: string;
  userId: string;
  userName: string;
  userEmail: string;
  isRead: boolean;
  createdAt: string;
  syncLogId: number;
}

async function loadNotifications(): Promise<Notification[]> {
  try {
    const data = await fs.readFile(NOTIFICATIONS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveNotifications(notifications: Notification[]) {
  await fs.writeFile(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));
}

// GET /api/notifications - Get all notifications
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');

    const notifications = await loadNotifications();
    
    // Filter unread only if requested
    let filteredNotifications = unreadOnly 
      ? notifications.filter(n => !n.isRead)
      : notifications;

    // Apply limit
    filteredNotifications = filteredNotifications.slice(0, limit);

    // Calculate unread count
    const unreadCount = notifications.filter(n => !n.isRead).length;

    return NextResponse.json({
      success: true,
      notifications: filteredNotifications,
      unreadCount,
      total: notifications.length
    });

  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

// PUT /api/notifications - Mark all as read
export async function PUT(request: NextRequest) {
  try {
    const { action } = await request.json();

    if (action === 'markAllRead') {
      const notifications = await loadNotifications();
      const updatedNotifications = notifications.map(notification => ({
        ...notification,
        isRead: true
      }));

      await saveNotifications(updatedNotifications);

      return NextResponse.json({
        success: true,
        message: 'All notifications marked as read'
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Error updating notifications:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update notifications' },
      { status: 500 }
    );
  }
}

// DELETE /api/notifications - Delete old notifications
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const olderThanDays = parseInt(searchParams.get('olderThanDays') || '30');

    const notifications = await loadNotifications();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const filteredNotifications = notifications.filter(notification => {
      const notificationDate = new Date(notification.createdAt);
      return notificationDate > cutoffDate;
    });

    await saveNotifications(filteredNotifications);

    const deletedCount = notifications.length - filteredNotifications.length;

    return NextResponse.json({
      success: true,
      message: `Deleted ${deletedCount} old notifications`,
      deletedCount
    });

  } catch (error) {
    console.error('Error deleting notifications:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete notifications' },
      { status: 500 }
    );
  }
}
