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

// GET /api/notifications/[id] - Get specific notification
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const notifications = await loadNotifications();
    const notification = notifications.find(n => n.id === params.id);

    if (!notification) {
      return NextResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      notification
    });

  } catch (error) {
    console.error('Error fetching notification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notification' },
      { status: 500 }
    );
  }
}

// PUT /api/notifications/[id] - Mark as read
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const notifications = await loadNotifications();
    const notificationIndex = notifications.findIndex(n => n.id === params.id);

    if (notificationIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      );
    }

    // Mark as read
    notifications[notificationIndex].isRead = true;
    await saveNotifications(notifications);

    return NextResponse.json({
      success: true,
      message: 'Notification marked as read',
      notification: notifications[notificationIndex]
    });

  } catch (error) {
    console.error('Error updating notification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update notification' },
      { status: 500 }
    );
  }
}

// DELETE /api/notifications/[id] - Delete specific notification
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const notifications = await loadNotifications();
    const filteredNotifications = notifications.filter(n => n.id !== params.id);

    if (filteredNotifications.length === notifications.length) {
      return NextResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      );
    }

    await saveNotifications(filteredNotifications);

    return NextResponse.json({
      success: true,
      message: 'Notification deleted'
    });

  } catch (error) {
    console.error('Error deleting notification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete notification' },
      { status: 500 }
    );
  }
}
