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
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function saveProducts(products: any[]) {
  await fs.writeFile(jsonFilePath, JSON.stringify(products, null, 2));
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const products = await getProducts();
  const { id } = params;
  const product = products.find((p: any) => p.id === id);

  if (product) {
    return NextResponse.json(product);
  } else {
    return NextResponse.json({ message: "Product not found" }, { status: 404 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const updatedProductData = await request.json();
  const products = await getProducts();
  const { id } = params;
  const productIndex = products.findIndex((p: any) => p.id === id);

  if (productIndex === -1) {
    return NextResponse.json({ message: "Product not found" }, { status: 404 });
  }

  const updatedProduct = {
    ...products[productIndex],
    ...updatedProductData,
    updatedAt: new Date().toISOString(),
  };

  products[productIndex] = updatedProduct;
  await saveProducts(products);
  logChange("products.json", `Product updated: ${updatedProduct.name} (ID: ${updatedProduct.id})`);

  return NextResponse.json(updatedProduct);
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const products = await getProducts();
  const { id } = params;
  const updatedProducts = products.filter((p: any) => p.id !== id);

  if (products.length === updatedProducts.length) {
    return NextResponse.json({ message: "Product not found" }, { status: 404 });
  }

  const deletedProduct = products.find((p: any) => p.id === id);
  await saveProducts(updatedProducts);
  if (deletedProduct) {
    logChange("products.json", `Product deleted: ${deletedProduct.name} (ID: ${deletedProduct.id})`);
  }

  return new Response(null, { status: 204 });
}
