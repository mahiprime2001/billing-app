export interface Product {
  id: string;
  name: string;
  price: number;
  barcodes: string[];
  stock: number;
  sellingPrice?: number;
  batchId?: string; // NEW
  createdAt: string;
  updatedAt: string;
}

export interface Batch {
  id: string;
  batchNumber: string;
  place: string;
}

export interface BillItem {
  id: string;
  productId?: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
  tax: number;
  gstRate: number;
  barcodes: string;
}

export interface Bill {
  id: string;
  storeId: string;
  storeName: string;
  storeAddress: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  customerId: string;
  subtotal: number;
  taxPercentage: number;
  taxAmount: number;
  discountPercentage: number;
  discountAmount: number;
  total: number;
  paymentMethod: string;
  timestamp: string;
  notes: string;
  gstin: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  billFormat: string;
  createdBy: string;
  items: BillItem[];
}
