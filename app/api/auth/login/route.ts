import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import crypto from "crypto"
import { decrypt } from "@/app/utils/cipher"

const usersFilePath = path.join(process.cwd(), "app/data/json/users.json")
const sessionFilePath = path.join(process.cwd(), "app/data/logs/session.json")

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

  if (user) {
    console.log("Provided password:", password)
    const decryptedPassword = decrypt(user.password)
    console.log("Decrypted password:", decryptedPassword)
    if (decryptedPassword !== password) {
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 })
    }
  } else {
    return NextResponse.json({ message: "Invalid email or password" }, { status: 401 })
  }

  // Do not send the password back to the client
  const { password: _, ...userWithoutPassword } = user

  const token = crypto.randomBytes(16).toString("hex")
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now

  const sessionData = {
    token: `session_${token}`,
    expiresAt: expiresAt.toISOString(),
  }

  try {
    fs.writeFileSync(sessionFilePath, JSON.stringify(sessionData, null, 2), "utf-8")
  } catch (error) {
    console.error("Error writing session file:", error)
    return NextResponse.json({ message: "Error creating session" }, { status: 500 })
  }

  return NextResponse.json({ ...userWithoutPassword, token: sessionData.token })
}
