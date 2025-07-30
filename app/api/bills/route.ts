import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { logChange } from "@/app/utils/logger";

const jsonFilePath = path.resolve(process.cwd(), "app/data/json/bills.json");

async function getBills() {
  try {
    const data = await fs.readFile(jsonFilePath, "utf-8");
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function saveBill(bill: any) {
  const bills = await getBills();
  bills.push(bill);
  await fs.writeFile(jsonFilePath, JSON.stringify(bills, null, 2));
}

export async function GET() {
  const bills = await getBills();
  return NextResponse.json(bills);
}

export async function POST(request: Request) {
  const newBill = await request.json();
  await saveBill(newBill);
  logChange("bills.json", `New bill created: (ID: ${newBill.id})`);
  return NextResponse.json(newBill, { status: 201 });
}
