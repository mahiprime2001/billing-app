"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function PrintBillPage() {
  const params = useParams();
  const billId = params.id;
  const [billData, setBillData] = useState<any>(null);

  useEffect(() => {
    console.log("PrintBillPage mounted for billId:", billId);
    // In a real application, you would fetch bill data here using billId
    // For now, we'll use dummy data
    const dummyBillData = {
      id: billId,
      date: new Date().toLocaleDateString(),
      items: [
        { name: "Product A", quantity: 2, price: 10.00 },
        { name: "Product B", quantity: 1, price: 25.50 },
        { name: "Product C", quantity: 3, price: 5.00 },
      ],
      total: 60.50,
    };
    setBillData(dummyBillData);

    // Automatically trigger print dialog after component mounts
    if (typeof window !== "undefined") {
      console.log("Calling window.print()");
      window.print();
    } else {
      console.log("window is undefined, cannot call window.print()");
    }
  }, [billId]);

  if (!billData) {
    return <div>Loading bill data...</div>;
  }

  return (
    <div className="print-container">
      <div className="bill-header">
        <h1>Invoice #{billData.id}</h1>
        <p>Date: {billData.date}</p>
      </div>

      <table className="bill-items">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {billData.items.map((item: any, index: number) => (
            <tr key={index}>
              <td>{item.name}</td>
              <td>{item.quantity}</td>
              <td>${item.price.toFixed(2)}</td>
              <td>${(item.quantity * item.price).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="bill-total">
        <p>Total: <span>${billData.total.toFixed(2)}</span></p>
      </div>

      <div className="bill-footer">
        <p>Thank you for your business!</p>
      </div>
    </div>
  );
}
