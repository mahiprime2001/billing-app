import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

const usersFilePath = path.join(process.cwd(), "app/data/json/users.json")

const readUsers = () => {
  try {
    const usersData = fs.readFileSync(usersFilePath, "utf-8")
    return JSON.parse(usersData)
  } catch (error) {
    console.error("Error reading users file:", error)
    return []
  }
}

export async function POST(request: Request) {
  const { email, password } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ message: "Email and password are required" }, { status: 400 })
  }

  const users = readUsers()
  const user = users.find((u: any) => u.email.toLowerCase() === email.toLowerCase())

  if (!user || user.password !== password) {
    return NextResponse.json({ message: "Invalid email or password" }, { status: 401 })
  }

  // Do not send the password back to the client
  const { password: _, ...userWithoutPassword } = user

  return NextResponse.json(userWithoutPassword)
}
