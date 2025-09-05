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

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const users = readUsers()
    const user = users.find((u: any) => u.id === id)

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 })
    }

    return NextResponse.json({ password: user.password })
  } catch (error) {
    console.error("Error decrypting password:", error)
    return NextResponse.json({ message: "Error decrypting password" }, { status: 500 })
  }
}
