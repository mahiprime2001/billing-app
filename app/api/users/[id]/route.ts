import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { encrypt } from "@/app/utils/cipher"
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

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const users = readUsers()
  const user = users.find((u: any) => u.id === id)

  if (!user) {
    return NextResponse.json({ message: "User not found" }, { status: 404 })
  }

  return NextResponse.json(user)
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const updatedUser = await request.json()
  const users = readUsers()

  const userIndex = users.findIndex((u: any) => u.id === id)

  if (userIndex === -1) {
    return NextResponse.json({ message: "User not found" }, { status: 404 })
  }

  // Check for duplicate email (excluding current user)
  if (users.some((user: any) => user.email === updatedUser.email && user.id !== id)) {
    return NextResponse.json({ message: "Email already exists" }, { status: 409 })
  }

  if (updatedUser.password) {
    users[userIndex].password = updatedUser.password
  }

  users[userIndex] = {
    ...users[userIndex],
    ...updatedUser,
    updatedAt: new Date().toISOString(),
  }

  writeUsers(users)
  logChange("users.json", `User updated: ${users[userIndex].name} (ID: ${users[userIndex].id})`);

  return NextResponse.json(users[userIndex])
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const users = readUsers()
  const userIndex = users.findIndex((u: any) => u.id === id)

  if (userIndex === -1) {
    return NextResponse.json({ message: "User not found" }, { status: 404 })
  }

  const deletedUser = users.splice(userIndex, 1)
  writeUsers(users)
  logChange("users.json", `User deleted: ${deletedUser[0].name} (ID: ${deletedUser[0].id})`);

  return NextResponse.json(deletedUser[0])
}
