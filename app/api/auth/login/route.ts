import { NextResponse } from "next/server"
import { encrypt } from "@/app/utils/cipher"

import users from "@/app/data/json/users.json";

export async function POST(request: Request) {
  const { email, password } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ message: "Email and password are required" }, { status: 400 })
  }

  const user = users.find((u: any) => u.email.toLowerCase() === email.toLowerCase())

  if (user) {
    if (user.password !== password) {
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 })
    }
  } else {
    return NextResponse.json({ message: "Invalid email or password" }, { status: 401 })
  }

  // Do not send the password back to the client
  const { password: _, ...userWithoutPassword } = user

  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now
  const sessionData = {
    user: userWithoutPassword,
  }

  const sessionValue = encrypt(JSON.stringify(sessionData))

  const response = NextResponse.json({ ...userWithoutPassword })
  response.cookies.set({
    name: "session",
    value: sessionValue,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  })

  return response
}
