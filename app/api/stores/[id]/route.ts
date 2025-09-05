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

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const stores = await getStores();
  const id = params.id;
  const store = stores.find((s: any) => s.id === id);

  if (store) {
    return NextResponse.json(store);
  } else {
    return NextResponse.json({ message: "Store not found" }, { status: 404 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const updatedStoreData = await request.json();
  const stores = await getStores();
  const id = params.id;
  const storeIndex = stores.findIndex((s: any) => s.id === id);

  if (storeIndex === -1) {
    return NextResponse.json({ message: "Store not found" }, { status: 404 });
  }

  const updatedStore = {
    ...stores[storeIndex],
    ...updatedStoreData,
    updatedAt: new Date().toISOString(),
  };

  stores[storeIndex] = updatedStore;
  await saveStores(stores);
  logChange("stores.json", `Store updated: ${updatedStore.name} (ID: ${updatedStore.id})`);

  return NextResponse.json(updatedStore);
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const stores = await getStores();
  const id = params.id;
  const updatedStores = stores.filter((s: any) => s.id !== id);

  if (stores.length === updatedStores.length) {
    return NextResponse.json({ message: "Store not found" }, { status: 404 });
  }

  const deletedStore = stores.find((s: any) => s.id === id);
  await saveStores(updatedStores);
  if (deletedStore) {
    logChange("stores.json", `Store deleted: ${deletedStore.name} (ID: ${deletedStore.id})`);
  }

  return new Response(null, { status: 204 });
}
