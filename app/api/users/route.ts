import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { logChange } from "@/app/utils/logger";

const usersFilePath = path.join(process.cwd(), "app/data/json/users.json")

// Function to read users from the JSON file
const readUsers = () => {
  try {
    const usersData = fs.readFileSync(usersFilePath, "utf-8")
    return JSON.parse(usersData)
  } catch (error) {
    console.error("Error reading users file:", error)
    return []
  }
}

// Function to write users to the JSON file
const writeUsers = (users: any) => {
  try {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2))
  } catch (error) {
    console.error("Error writing users file:", error)
  }
}

export async function GET() {
  const users = readUsers()
  return NextResponse.json(users)
}

export async function POST(request: Request) {
  const newUser = await request.json()
  const users = readUsers()

  // Basic validation
  if (!newUser.name || !newUser.email || !newUser.password) {
    return NextResponse.json({ message: "Missing required fields" }, { status: 400 })
  }

  // Check for duplicate email
  if (users.some((user: any) => user.email === newUser.email)) {
    return NextResponse.json({ message: "Email already exists" }, { status: 409 })
  }

  const userWithDefaults = {
    id: Date.now().toString(),
    ...newUser,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  users.push(userWithDefaults)
  writeUsers(users)
  logChange("users.json", `New user created: ${userWithDefaults.name} (ID: ${userWithDefaults.id})`);

  return NextResponse.json(userWithDefaults, { status: 201 })
}
