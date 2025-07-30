import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { logChange } from "@/app/utils/logger";

const jsonFilePath = path.resolve(process.cwd(), "app/data/json/products.json");

async function getProducts() {
  try {
    const data = await fs.readFile(jsonFilePath, "utf-8");
    return JSON.parse(data);
  } catch (error: any) {
    // If the file doesn't exist, return an empty array
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function saveProducts(products: any[]) {
  await fs.writeFile(jsonFilePath, JSON.stringify(products, null, 2));
}

export async function GET() {
  const products = await getProducts();
  return NextResponse.json(products);
}

export async function POST(request: Request) {
  const newProduct = await request.json();
  const products = await getProducts();

  newProduct.id = Date.now().toString();
  newProduct.createdAt = new Date().toISOString();
  newProduct.updatedAt = new Date().toISOString();

  products.push(newProduct);
  await saveProducts(products);
  logChange("products.json", `New product created: ${newProduct.name} (ID: ${newProduct.id})`);

  return NextResponse.json(newProduct, { status: 201 });
}
