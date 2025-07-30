import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { logChange } from "@/app/utils/logger";

const jsonFilePath = path.resolve(process.cwd(), "app/data/json/stores.json");

async function getStores() {
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

async function saveStores(stores: any[]) {
  await fs.writeFile(jsonFilePath, JSON.stringify(stores, null, 2));
}

export async function GET() {
  const stores = await getStores();
  return NextResponse.json(stores);
}

export async function POST(request: Request) {
  const newStore = await request.json();
  const stores = await getStores();
  
  const updatedStore = {
    ...newStore,
    id: `STR-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };

  stores.push(updatedStore);
  await saveStores(stores);
  logChange("stores.json", `New store created: ${updatedStore.name} (ID: ${updatedStore.id})`);
  
  return NextResponse.json(updatedStore, { status: 201 });
}
