import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import pool from "@/lib/mysql";

const billsFilePath = path.join(process.cwd(), "app/data/json/bills.json");

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const billId = params.id;
  try {
    // Read bills from JSON file
    const billsData = fs.readFileSync(billsFilePath, "utf-8");
    let bills = JSON.parse(billsData);

    // Find the index of the bill to delete
    const billIndex = bills.findIndex((bill: any) => bill.id === billId);

    if (billIndex === -1) {
      return NextResponse.json({ message: "Bill not found" }, { status: 404 });
    }

    // Remove the bill from the array
    bills.splice(billIndex, 1);

    // Write the updated bills array back to the JSON file
    fs.writeFileSync(billsFilePath, JSON.stringify(bills, null, 2));

    // Delete from MySQL
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      await connection.query("DELETE FROM BillItems WHERE billId = ?", [billId]);
      await connection.query("DELETE FROM Bills WHERE id = ?", [billId]);
      
      // Log the deletion to the sync_table
      const syncTime = new Date();
      const changeType = "delete";
      const changeData = { table: "Bills", id: billId };
      await connection.query(
        "INSERT INTO sync_table (sync_time, change_type, change_data) VALUES (?, ?, ?)",
        [syncTime, changeType, JSON.stringify(changeData)]
      );
      
      await connection.commit();
    } catch (error) {
      if (connection) await connection.rollback();
      throw error;
    } finally {
      if (connection) connection.release();
    }

    return NextResponse.json({ message: "Bill deleted successfully" });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 }
    );
  }
}
