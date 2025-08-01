export interface Product {
  id: string;
  name: string;
  price: number;
  barcodes: string[];
  stock: number;
  category?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}
