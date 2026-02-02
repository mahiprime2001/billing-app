export interface Product {
  id: string;
  name: string;
  price: number;
  barcode?: string; // String for backend storage, comma-separated
  stock: number;
  sellingPrice?: number;
  batchid?: string; // Changed from batchId to match database
  createdAt: string;
  updatedAt: string;
  tax?: number;
}


export interface StoreInventory {
  id: string;
  storeId: string;
  productId: string;
  quantity: number;
  assignedAt: string;
  updatedAt: string;
}


export interface Batch {
  id: string;
  batchNumber: string; // Corrected to lowercase 'n' to match backend
  place: string;
  createdAt?: string; // Added createdAt to Batch interface
  updatedAt?: string; // Added updatedAt to Batch interface
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
