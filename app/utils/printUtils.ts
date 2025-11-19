import { invoke } from "@tauri-apps/api/core";
// import { print } from "@tauri-apps/api/printing"; // Removed direct import, will use invoke

// Type guard to check if running in Tauri environment
declare global {
  interface Window {
    __TAURI__?: object;
  }
}

/**
 * Opens a new window, writes the provided HTML content to it, and triggers the print dialog.
 * This function is used for web-based printing.
 * @param htmlContent The HTML string to display and print.
 */
async function printInBrowserWindow(htmlContent: string): Promise<void> {
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    // printWindow.close(); // Removed to prevent immediate closing of print dialog
    console.log("Print dialog triggered successfully in browser. User needs to close the window manually.");
  } else {
    console.error("Failed to open new window for printing.");
    throw new Error("Failed to open new window for printing.");
  }
}

/**
 * Handles thermal label printing.
 * This function is intended for use within the Tauri desktop application.
 * @param content The content to print (raw text or label-formatted PDF).
 * @param isThermalPrinter A flag to indicate if the target printer is a thermal printer.
 * @returns A Promise that resolves when the print job is sent.
 */
async function printThermalLabel(content: string, isThermalPrinter: boolean): Promise<void> {
  if (!isThermalPrinter) {
    console.warn("Attempted to print thermal label to a non-thermal printer.");
    throw new Error("Not a thermal printer.");
  }
  try {
    // Call backend command for thermal printing
    await invoke("print_thermal_document", { content });
    console.log("Thermal label content sent to printer successfully.");
  } catch (error) {
    console.error("Failed to print thermal label:", error);
    throw error;
  }
}

/**
 * Unified printing function that handles different print scenarios.
 * @param options An object containing printing options.
 * @param options.htmlContent Optional HTML content for window-based printing.
 * @param options.thermalContent Optional content for thermal printing.
 * @param options.isThermalPrinter Optional flag to indicate if the target printer is a thermal printer.
 * @returns A Promise that resolves when the print job is completed.
 */
export async function unifiedPrint({
  htmlContent,
  thermalContent,
  isThermalPrinter = false,
  productIds, // New parameter for product IDs
  copies = 1, // New parameter for copies
  useBackendPrint = false, // New flag to use backend printing
  printerName, // optional printer name to send to backend
  storeName, // optional store name to send to backend
}: {
  htmlContent?: string;
  thermalContent?: string;
  isThermalPrinter?: boolean;
  productIds?: string[]; // Type for product IDs
  copies?: number; // Type for copies
  useBackendPrint?: boolean; // Type for backend print flag
  printerName?: string;
  storeName?: string;
}): Promise<void> {
  // If caller requests backend print and provides productIds, attempt backend print first.
  if (useBackendPrint && productIds && productIds.length > 0) {
    try {
      const backendApiUrl = (process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8080").replace(/\/+$/g, "");
      const payload: any = { productIds, copies };
      if (printerName) payload.printerName = printerName;
      if (storeName) payload.storeName = storeName;

      const response = await fetch(`${backendApiUrl}/api/print-label`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.status === "success") {
        console.log("Backend print succeeded:", data.message || "");
        return;
      }
      console.warn("Backend print returned non-success, falling back to browser print", data);
      // fallthrough to browser printing below
    } catch (err) {
      console.error("Error sending backend print request, falling back to browser print:", err);
      // fallthrough to browser printing below
    }
  }

  // For web use open a browser window and call window.print().
  if (htmlContent) {
    await printInBrowserWindow(htmlContent);
    return;
  }

  if (thermalContent) {
    // Wrap thermal content in a simple HTML template so it can be printed via browser.
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Print</title><style>body{font-family:monospace;white-space:pre-wrap;}</style></head><body><pre>${escapeHtml(
      thermalContent,
    )}</pre></body></html>`;
    await printInBrowserWindow(html);
    return;
  }

  throw new Error("No printable content provided.");
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
