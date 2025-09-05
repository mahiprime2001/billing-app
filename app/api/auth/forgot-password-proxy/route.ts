// app/api/auth/forgot-password-proxy/route.ts
// For App Router (app directory)

import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/mysql'

interface ForgotPasswordRequest {
  email: string
}

// Helper function to execute MySQL queries with retry
async function executeQuery(query: string, params: any[] = []) {
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.execute(query, params);
    return rows;
  } finally {
    if (connection) connection.release();
  }
}

// Function to log password reset to sync_table for admin notifications
async function logPasswordResetRequest(email: string) {
  try {
    // Get user info from database
    const users = await executeQuery(
      'SELECT id, name, email FROM Users WHERE email = ? AND status = "active"',
      [email]
    ) as any[];

    if (users.length > 0) {
      const user = users[0];
      const changeData = {
        id: user.id,
        name: user.name,
        email: user.email,
        action: 'password_reset_request'
      };

      await executeQuery(
        'INSERT INTO sync_table (sync_time, change_type, change_data) VALUES (NOW(), ?, ?)',
        ['password_reset', JSON.stringify(changeData)]
      );

      console.log(`Password reset request logged to sync_table for user: ${user.name}`);
    }
  } catch (error) {
    console.error('Failed to log password reset request:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email }: ForgotPasswordRequest = body

    if (!email) {
      return NextResponse.json(
        { success: false, message: 'Email is required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, message: 'Please enter a valid email address' },
        { status: 400 }
      )
    }

    // Log password reset request for admin notifications
    await logPasswordResetRequest(email);

    // Forward request to PHP endpoint (same as billing app)
    const phpEndpoint = 'https://siri.ifleon.com/forgot-password.php'
    
    console.log('Forwarding admin password reset request to PHP endpoint:', phpEndpoint)
    
    const response = await fetch(phpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.PHP_API_KEY || '', // Empty string if no API key
        'User-Agent': 'NextJS-AdminApp/1.0',
        'X-Source': 'admin-panel', // Identify requests from admin panel
      },
      body: JSON.stringify({ email }),
    })

    console.log('PHP response status:', response.status)

    if (!response.ok) {
      console.error('PHP endpoint error:', response.status, response.statusText)
      throw new Error(`PHP endpoint returned status: ${response.status}`)
    }

    const data = await response.json()
    console.log('PHP response data:', data)
    
    return NextResponse.json({
      success: data.success || true,
      message: data.message || 'If an account with that email exists, we have sent a password reset link.'
    })

  } catch (error) {
    console.error('Error calling PHP forgot password endpoint:', error)
    
    return NextResponse.json(
      { success: false, message: 'Unable to process your request at this time. Please try again later.' },
      { status: 500 }
    )
  }
}

// Handle OPTIONS for CORS preflight if needed
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
