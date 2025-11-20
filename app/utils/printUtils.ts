import { invoke } from "@tauri-apps/api/core";

// Type guard to check if running in Tauri environment
declare global {
  interface Window {
    __TAURI__?: object;
  }
}

/**
 * Opens a hidden iframe, writes the provided HTML content to it, and triggers the print dialog.
 * This function is used for web-based printing.
 * @param htmlContent The HTML string to display and print.
 */
async function printInBrowserWindow(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Create a hidden iframe for printing
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      
      document.body.appendChild(iframe);
      
      // Write content to iframe
      const iframeDoc = iframe.contentWindow?.document;
      if (!iframeDoc) {
        document.body.removeChild(iframe);
        reject(new Error('Failed to access iframe document'));
        return;
      }
      
      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();
      
      // Wait for content to load, then print
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          
          // Clean up after printing (with delay to ensure print dialog appears)
          setTimeout(() => {
            if (iframe.parentNode) {
              document.body.removeChild(iframe);
            }
            resolve();
          }, 1000);
        } catch (printError) {
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
          reject(printError);
        }
      };
      
      // Fallback if onload doesn't fire
      setTimeout(() => {
        try {
          if (iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => {
              if (iframe.parentNode) {
                document.body.removeChild(iframe);
              }
              resolve();
            }, 1000);
          }
        } catch (e) {
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
          reject(e);
        }
      }, 500);
      
    } catch (error) {
      console.error('Print error:', error);
      reject(error);
    }
  });
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
 * @param options.productIds Optional product IDs for backend printing.
 * @param options.copies Optional number of copies to print.
 * @param options.useBackendPrint Optional flag to use backend printing.
 * @param options.printerName Optional printer name for backend printing.
 * @param options.storeName Optional store name for backend printing.
 * @returns A Promise that resolves when the print job is completed.
 */
export async function unifiedPrint({
  htmlContent,
  thermalContent,
  isThermalPrinter = false,
  productIds,
  copies = 1,
  useBackendPrint = false,
  printerName,
  storeName,
}: {
  htmlContent?: string;
  thermalContent?: string;
  isThermalPrinter?: boolean;
  productIds?: string[];
  copies?: number;
  useBackendPrint?: boolean;
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

      console.log("📤 Sending backend print request:", payload);

      const response = await fetch(`${backendApiUrl}/api/print-label`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      const data = await response.json().catch(() => ({}));
      
      if (response.ok && data.status === "success") {
        console.log("✅ Backend print succeeded:", data.message || "");
        return; // ✅ SUCCESS - exit here
      }
      
      console.warn("⚠️ Backend print returned non-success, falling back to browser print", data);
      // fallthrough to browser printing below
    } catch (err) {
      console.error("❌ Error sending backend print request, falling back to browser print:", err);
      // fallthrough to browser printing below
    }
  }

  // For browser-based printing with HTML content
  if (htmlContent) {
    console.log("🖨️ Using browser-based HTML printing");
    await printInBrowserWindow(htmlContent);
    return;
  }

  // For thermal content, wrap in HTML and print via browser
  if (thermalContent) {
    console.log("🖨️ Using browser-based thermal content printing");
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Print</title>
  <style>
    body {
      font-family: monospace;
      white-space: pre-wrap;
      margin: 0;
      padding: 10mm;
    }
  </style>
</head>
<body><pre>${escapeHtml(thermalContent)}</pre></body>
</html>`;
    await printInBrowserWindow(html);
    return;
  }

  throw new Error("No printable content provided.");
}

/**
 * Escapes HTML special characters to prevent XSS and rendering issues.
 * @param s The string to escape.
 * @returns The escaped string.
 */
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
