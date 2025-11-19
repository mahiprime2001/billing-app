export function getBarcode(product: any): string | undefined {
  if (!product) return undefined;

  // Prefer the new `barcode` field when present and non-empty
  if (typeof product.barcode === "string" && product.barcode.trim() !== "") return product.barcode;

  // Legacy: `barcodes` may be an array or a single string
  if (Array.isArray(product.barcodes) && product.barcodes.length > 0) {
    const first = product.barcodes.find((b: any) => typeof b === "string" && b.trim() !== "");
    if (first) return first;
  }

  if (typeof product.barcodes === "string" && product.barcodes.trim() !== "") return product.barcodes;

  return undefined;
}

export default getBarcode;
