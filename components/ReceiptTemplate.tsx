import React from "react";
import { BillFormat } from "@/app/billing/page";

interface ReceiptProps {
  bill: any;
  format: BillFormat;
}

const ReceiptTemplate: React.FC<ReceiptProps> = ({ bill, format }) => {
  const isLetter = format.width === 216 && format.height === 279;
  const isA4 = format.width === 210 && format.height === 297;
  const isThermal = format.width <= 80;
  const maxWidth = isThermal ? "80mm" : isLetter ? "216mm" : isA4 ? "210mm" : `${format.width}mm`;

  const style = `
    @page {
      size: ${isLetter ? "letter" : isA4 ? "A4" : `${format.width}mm ${format.height === "auto" ? "auto" : `${format.height}mm`}`};
      margin: ${format.margins.top}mm ${format.margins.right}mm ${format.margins.bottom}mm ${format.margins.left}mm;
    }
    body {
      font-family: 'Arial', sans-serif;
      max-width: ${maxWidth};
      margin: 0 auto;
      font-size: 13px;
      color: #000;
    }
    .header, .footer {
      text-align: center;
      padding: 10px 0;
    }
    .company-name {
      font-size: 18px;
      font-weight: bold;
      text-transform: uppercase;
    }
    .invoice-title {
      font-size: 16px;
      font-weight: bold;
      margin-top: 10px;
    }
    .section {
      margin: 20px 0;
    }
    .section-title {
      font-weight: bold;
      border-bottom: 1px solid #ccc;
      margin-bottom: 5px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }
    .items-table th, .items-table td {
      border: 1px solid #ccc;
      padding: 6px 8px;
      text-align: left;
    }
    .items-table th {
      background-color: #f2f2f2;
    }
    .totals {
      margin-top: 10px;
      width: 100%;
    }
    .totals td {
      padding: 6px;
    }
    .totals .label {
      text-align: right;
      font-weight: bold;
    }
    .totals .value {
      text-align: right;
      width: 100px;
    }
  `;

  return (
    <html>
      <head>
        <title>Invoice - {bill.id}</title>
        <style dangerouslySetInnerHTML={{ __html: style }} />
      </head>
      <body>
        <div className="header">
          <div className="company-name">{bill.companyName}</div>
          <div>{bill.companyAddress}</div>
          <div>Phone: {bill.companyPhone}</div>
          <div>Email: {bill.companyEmail}</div>
          <div className="invoice-title">INVOICE</div>
        </div>

        <div className="section">
          <div className="row">
            <div><strong>Invoice ID:</strong> {bill.id}</div>
            <div><strong>Date:</strong> {new Date(bill.timestamp).toLocaleString()}</div>
          </div>
          {bill.gstin && <div><strong>GSTIN:</strong> {bill.gstin}</div>}
        </div>

        {(bill.customerName || bill.customerPhone) && (
          <div className="section">
            <div className="section-title">Customer Details</div>
            {bill.customerName && <div>Name: {bill.customerName}</div>}
            {bill.customerPhone && <div>Phone: {bill.customerPhone}</div>}
            {bill.customerEmail && <div>Email: {bill.customerEmail}</div>}
            {bill.customerAddress && <div>Address: {bill.customerAddress}</div>}
          </div>
        )}

        <div className="section">
          <table className="items-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {bill.items.map((item: any, i: number) => (
                <tr key={item.productId}>
                  <td>{i + 1}</td>
                  <td>{item.productName}</td>
                  <td>{item.quantity}</td>
                  <td>₹{item.price.toFixed(2)}</td>
                  <td>₹{item.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="section">
          <table className="totals">
            <tr>
              <td className="label">Subtotal:</td>
              <td className="value">₹{bill.subtotal.toFixed(2)}</td>
            </tr>
            {bill.discountAmount > 0 && (
              <tr>
                <td className="label">Discount ({bill.discountPercentage.toFixed(1)}%):</td>
                <td className="value">-₹{bill.discountAmount.toFixed(2)}</td>
              </tr>
            )}
            <tr>
              <td className="label">Tax ({bill.taxPercentage}%):</td>
              <td className="value">₹{bill.taxAmount.toFixed(2)}</td>
            </tr>
            <tr>
              <td className="label">Total:</td>
              <td className="value"><strong>₹{bill.total.toFixed(2)}</strong></td>
            </tr>
            <tr>
              <td className="label">Payment:</td>
              <td className="value">{bill.paymentMethod.toUpperCase()}</td>
            </tr>
          </table>
        </div>

        {bill.notes && (
          <div className="section">
            <div className="section-title">Notes</div>
            <div>{bill.notes}</div>
          </div>
        )}

        <div className="footer">
          <p>Thank you for your business!</p>
        </div>
      </body>
    </html>
  );
};

export default ReceiptTemplate;
