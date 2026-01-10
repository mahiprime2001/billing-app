import { invoke } from "@tauri-apps/api/core";

declare global {
  interface Window {
    __TAURI__?: object;
  }
}

async function printInBrowserWindow(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      let printExecuted = false;

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';

      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document;
      if (!iframeDoc) {
        document.body.removeChild(iframe);
        reject(new Error('Failed to access iframe document'));
        return;
      }

      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();

      iframe.onload = () => {
        if (printExecuted) return;
        printExecuted = true;

        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();

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

      setTimeout(() => {
        if (printExecuted) return;
        printExecuted = true;

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

async function printThermalLabel(content: string, isThermalPrinter: boolean): Promise<void> {
  if (!isThermalPrinter) {
    console.warn("Attempted to print thermal label to a non-thermal printer.");
    throw new Error("Not a thermal printer.");
  }
  try {
    await invoke("print_thermal_document", { content });
    console.log("Thermal label content sent to printer successfully.");
  } catch (error) {
    console.error("Failed to print thermal label:", error);
    throw error;
  }
}

// ✅ FIXED: Proper payload typing
export async function unifiedPrint({
  htmlContent,
  thermalContent,
  isThermalPrinter = false,
  labelData,
  copies = 1,
  useBackendPrint = false,
  printerName,
  storeName,
}: {
  htmlContent?: string;
  thermalContent?: string;
  isThermalPrinter?: boolean;
  labelData?: Array<{
    id: string;
    name: string;
    price: number;
    barcode: string;
  }>;
  copies?: number;
  useBackendPrint?: boolean;
  printerName?: string | undefined;
  storeName?: string | undefined;
}): Promise<void> {
  // ✅ FIXED: Properly typed payload
  if (useBackendPrint && labelData && labelData.length > 0) {
    try {
      const backendApiUrl = (process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8080").replace(/\/+$/g, "");
      const payload: any = { 
        labelData,
        copies 
      };
      
      // ✅ FIXED: Safe property assignment
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
        return;
      }
      
      console.warn("⚠️ Backend print returned non-success, falling back to browser print", data);
    } catch (err) {
      console.error("❌ Error sending backend print request, falling back to browser print:", err);
    }
  }

  if (htmlContent) {
    console.log("🖨️ Using browser-based HTML printing");
    await printInBrowserWindow(htmlContent);
    return;
  }

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

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
