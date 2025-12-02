export function getBarcode(product: any): string | undefined {
  if (!product) return undefined;

  // Always prefer the `barcodes` array as defined in the Product interface.
  // The normalizedProducts memo in products/page.tsx already handles
  // converting legacy singular `barcode` fields into this array.
  if (Array.isArray(product.barcodes) && product.barcodes.length > 0) {
    const firstValidBarcode = product.barcodes.find((b: any) => typeof b === "string" && b.trim() !== "");
    if (firstValidBarcode) return firstValidBarcode;
  }

  // Fallback for very old data structures where 'barcode' might still exist as a singular string directly
  // This should ideally be handled by normalizedProducts, but kept for robustness.
  if (typeof product.barcode === "string" && product.barcode.trim() !== "") return product.barcode;

  return undefined;
}

export default getBarcode;
