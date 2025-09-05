import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { logChange } from "@/app/utils/logger";
import pool from "../../../lib/mysql";

const billsJsonPath = path.resolve(process.cwd(), "app/data/json/bills.json");
const productsJsonPath = path.resolve(process.cwd(), "app/data/json/products.json");

async function getBills() {
  try {
    const data = await fs.readFile(billsJsonPath, "utf-8");
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
  await fs.writeFile(billsJsonPath, JSON.stringify(bills, null, 2));
}

export async function GET() {
  const bills = await getBills();
  return NextResponse.json(bills);
}

export async function POST(request: Request) {
  const newBill = await request.json();
  await saveBill(newBill);
  logChange("bills.json", `New bill created: (ID: ${newBill.id})`);

  // Update stock in products.json
  try {
    const productsData = await fs.readFile(productsJsonPath, "utf-8");
    const products = JSON.parse(productsData);

    for (const item of newBill.items) {
      const productIndex = products.findIndex((p: any) => p.id === item.productId);
      if (productIndex !== -1) {
        products[productIndex].stock -= item.quantity;
        logChange("products.json", `Stock updated for product ${item.productId}: new stock ${products[productIndex].stock}`);
      }
    }

    await fs.writeFile(productsJsonPath, JSON.stringify(products, null, 2));
  } catch (error) {
    console.error('Error updating stock in products.json:', error);
  }

  // Update stock and other details in MySQL
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Check if user exists
    if (newBill.createdBy && newBill.createdBy !== 'prime') {
      const [rows] = await connection.execute('SELECT id FROM Users WHERE id = ?', [newBill.createdBy]);
      if ((rows as any[]).length === 0) {
        console.error(`User with id ${newBill.createdBy} not found. Skipping bill insertion.`);
        await connection.rollback();
        connection.release();
        return NextResponse.json({ message: "User not found" }, { status: 400 });
      }
    }

    // Insert the bill first
    await connection.execute(
      `INSERT INTO Bills (id, storeId, storeName, storeAddress, customerName, customerPhone, customerEmail, customerAddress, customerId, subtotal, taxPercentage, taxAmount, discountPercentage, discountAmount, total, paymentMethod, timestamp, notes, gstin, companyName, companyAddress, companyPhone, companyEmail, billFormat, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newBill.id,
        newBill.storeId ?? null,
        newBill.storeName ?? null,
        newBill.storeAddress ?? null,
        newBill.customerName ?? null,
        newBill.customerPhone ?? null,
        newBill.customerEmail ?? null,
        newBill.customerAddress ?? null,
        newBill.customerId ?? null,
        newBill.subtotal ?? 0,
        newBill.taxPercentage ?? 0,
        newBill.taxAmount ?? 0,
        newBill.discountPercentage ?? 0,
        newBill.discountAmount ?? 0,
        newBill.total ?? 0,
        newBill.paymentMethod ?? null,
        newBill.timestamp,
        newBill.notes ?? null,
        newBill.gstin ?? null,
        newBill.companyName ?? null,
        newBill.companyAddress ?? null,
        newBill.companyPhone ?? null,
        newBill.companyEmail ?? null,
        newBill.billFormat ?? null,
        newBill.createdBy ?? null,
      ]
    );

    // Then insert bill items
    for (const item of newBill.items) {
      await connection.execute(
        'INSERT INTO BillItems (billId, productId, name, quantity, price, total, tax, gstRate, barcodes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [newBill.id, item.productId, item.name, item.quantity, item.price, item.total, item.tax, item.gstRate, item.barcodes]
      );

      if (item.productId) {
        await connection.execute(
          'UPDATE Products SET stock = stock - ? WHERE id = ?',
          [item.quantity, item.productId]
        );
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error('Error inserting bill into MySQL:', error);
    // Optionally, handle the error more gracefully
  } finally {
    connection.release();
  }

  return NextResponse.json(newBill, { status: 201 });
}
