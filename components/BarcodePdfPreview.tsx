'use client';

import React, { useRef } from 'react';
import { Product } from '@/lib/types';
import Barcode from 'react-barcode';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

const BarcodeLabel = ({ product, storeName }: { product: Product; storeName: string }) => {
  const barcode = (product.barcodes && product.barcodes[0]) || product.id;
  
  return (
    <div className="barcode p-2 border border-gray-200 rounded-md flex flex-col justify-between" style={{ height: '80px' }}>
      <div className="text-[10px] font-bold text-center">{storeName}</div>
      <div className="flex-1 flex flex-col items-center justify-center">
        <Barcode 
          value={barcode}
          width={1.2}
          height={30}
          fontSize={8}
          margin={0}
          displayValue={false}
          className="barcode-svg"
        />
        <div className="text-[8px] font-mono tracking-widest mt-1">{barcode}</div>
      </div>
      <div className="flex justify-between items-center text-[10px] mt-1">
        <div className="truncate max-w-[60%]">{product.name}</div>
        <div className="font-medium whitespace-nowrap">₹{product.price.toFixed(2)}</div>
      </div>
    </div>
  );
};

interface BarcodePdfDocumentProps {
  products: Product[];
  storeName: string;
  quantityPerProduct?: number;
  onCancel?: () => void;
}

export const BarcodePdfDocument: React.FC<BarcodePdfDocumentProps> = ({ 
  products, 
  storeName,
  quantityPerProduct = 1,
  onCancel,
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  
  // Flatten the products array to include each product multiple times based on quantity
  const labels = React.useMemo(() => 
    products.flatMap((product: Product) => 
      Array(quantityPerProduct).fill(product)
    ) as Product[],
    [products, quantityPerProduct]
  );

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow && printRef.current) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Print Barcodes</title>
            <style>
              @page { size: auto; margin: 0mm; }
              body { margin: 0; padding: 10mm; }
              .print-content {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 4mm;
                width: 100%;
              }
              .barcode {
                border: 1px solid #000;
                border-radius: 4px;
                padding: 2mm;
                height: 32mm;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                page-break-inside: avoid;
                break-inside: avoid;
              }
              .barcode-svg {
                max-width: 100%;
                height: auto !important;
              }
              @media print {
                @page { size: A4; margin: 10mm; }
                body { margin: 0; padding: 0; }
              }
            </style>
          </head>
          <body>
            <div class="print-content">
              ${printRef.current.innerHTML}
            </div>
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                  setTimeout(window.close, 100);
                }, 200);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2 print:hidden">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          Print Barcodes
        </Button>
      </div>
      <div ref={printRef} className="print-content">
        {labels.map((product: Product, index: number) => (
          <BarcodeLabel 
            key={`${product.id}-${index}`} 
            product={product} 
            storeName={storeName} 
          />
        ))}
      </div>
    </div>
  )
};
