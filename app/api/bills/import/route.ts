import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { connectToDatabase } from "@/lib/mysql"; // Assuming you have a mysql connection utility
import { createLog } from "@/app/utils/logger"; // Assuming a logger utility

const BILLS_JSON_PATH = path.join(process.cwd(), "app", "data", "json", "bills.json");
const BILLS_LOG_PATH = path.join(process.cwd(), "app", "data", "logs", "bills.json.log");

export async function POST(req: NextRequest) {
  try {
    const importedBills = await req.json();

    // Read existing bills
    let existingBills: any[] = [];
    try {
      const data = await fs.readFile(BILLS_JSON_PATH, "utf-8");
      existingBills = JSON.parse(data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.warn("bills.json not found, starting with an empty array.");
      } else {
        console.error("Error reading existing bills.json:", error);
        return NextResponse.json({ message: "Failed to read existing bills data" }, { status: 500 });
      }
    }

    const newBills: any[] = [];
    const commonBills: any[] = [];
    const logEntries: string[] = [];

    for (const importedBill of importedBills) {
      const isCommon = existingBills.some((existingBill) => existingBill.id === importedBill.id);
      if (isCommon) {
        commonBills.push(importedBill);
        logEntries.push(`[INFO] Bill with ID ${importedBill.id} already exists. Skipping.`);
      } else {
        newBills.push(importedBill);
        logEntries.push(`[INFO] New bill with ID ${importedBill.id} imported.`);
      }
    }

    if (newBills.length > 0) {
      const updatedBills = [...existingBills, ...newBills];
      await fs.writeFile(BILLS_JSON_PATH, JSON.stringify(updatedBills, null, 2), "utf-8");
      logEntries.push(`[SUCCESS] ${newBills.length} new bills added to bills.json.`);

      // Upload new bills to MySQL
      const db = await connectToDatabase();
      for (const bill of newBills) {
        // Basic insertion, adjust table and column names as per your schema
        // Insert into Bills table
        const billQuery = `
          INSERT INTO Bills (id, storeId, storeName, storeAddress, customerName, customerEmail, customerPhone, customerAddress, customerId, subtotal, taxPercentage, taxAmount, discountPercentage, discountAmount, total, paymentMethod, timestamp, notes, gstin, companyName, companyAddress, companyPhone, companyEmail, billFormat, createdBy)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            storeId = VALUES(storeId),
            storeName = VALUES(storeName),
            storeAddress = VALUES(storeAddress),
            customerName = VALUES(customerName),
            customerEmail = VALUES(customerEmail),
            customerPhone = VALUES(customerPhone),
            customerAddress = VALUES(customerAddress),
            customerId = VALUES(customerId),
            subtotal = VALUES(subtotal),
            taxPercentage = VALUES(taxPercentage),
            taxAmount = VALUES(taxAmount),
            discountPercentage = VALUES(discountPercentage),
            discountAmount = VALUES(discountAmount),
            total = VALUES(total),
            paymentMethod = VALUES(paymentMethod),
            timestamp = VALUES(timestamp),
            notes = VALUES(notes),
            gstin = VALUES(gstin),
            companyName = VALUES(companyName),
            companyAddress = VALUES(companyAddress),
            companyPhone = VALUES(companyPhone),
            companyEmail = VALUES(companyEmail),
            billFormat = VALUES(billFormat),
            createdBy = VALUES(createdBy)
        `;
        await db.execute(billQuery, [
          bill.id,
          bill.storeId || null,
          bill.storeName || null,
          bill.storeAddress || null,
          bill.customerName || null,
          bill.customerEmail || null,
          bill.customerPhone || null,
          bill.customerAddress || null,
          bill.customerId || null,
          bill.subtotal,
          bill.taxPercentage || 0,
          bill.taxAmount,
          bill.discountPercentage,
          bill.discountAmount,
          bill.total,
          bill.paymentMethod || null,
          bill.timestamp,
          bill.notes || null,
          bill.gstin || null,
          bill.companyName || null,
          bill.companyAddress || null,
          bill.companyPhone || null,
          bill.companyEmail || null,
          bill.billFormat || null,
          bill.createdBy || null,
        ]);

        // Insert into BillItems table
        if (bill.items && bill.items.length > 0) {
          for (const item of bill.items) {
            const itemQuery = `
              INSERT INTO BillItems (billId, productId, productName, quantity, price, total, tax, gstRate, barcodes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                productId = VALUES(productId),
                productName = VALUES(productName),
                quantity = VALUES(quantity),
                price = VALUES(price),
                total = VALUES(total),
                tax = VALUES(tax),
                gstRate = VALUES(gstRate),
                barcodes = VALUES(barcodes)
            `;
            await db.execute(itemQuery, [
              bill.id,
              item.productId || null,
              item.productName || null,
              item.quantity,
              item.price,
              item.total,
              item.tax || 0,
              item.gstRate || 0,
              item.barcodes || null,
            ]);
          }
        }
      }
      logEntries.push(`[SUCCESS] ${newBills.length} new bills uploaded to MySQL.`);
    } else {
      logEntries.push(`[INFO] No new bills to add.`);
    }

    // Create a log file
    await createLog(BILLS_LOG_PATH, logEntries.join("\n"));
    logEntries.push(`[SUCCESS] Import log created at ${BILLS_LOG_PATH}`);

    return NextResponse.json({
      message: "Bills import process completed",
      newBillsCount: newBills.length,
      commonBillsCount: commonBills.length,
      log: logEntries,
    });
  } catch (error) {
    console.error("Error during bills import:", error);
    return NextResponse.json({ message: "Internal server error during bills import" }, { status: 500 });
  }
}
