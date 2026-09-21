import { invoke } from "@tauri-apps/api/core";
import { generateTspl, type LabelProfile } from "@/lib/tspl-generator";

declare global {
  interface Window {
    __TAURI__?: object;
  }
}

async function printInBrowserWindow(html: string, preferNewWindow = false): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      if (preferNewWindow) {
        const printWindow = window.open("", "_blank", "width=800,height=900");
        if (!printWindow) {
          reject(new Error("Failed to open print window"));
          return;
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        setTimeout(() => {
          printWindow.close();
          resolve();
        }, 500);
        return;
      }

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

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI__);
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
  labelProfile,
  labelDimensions,
}: {
  htmlContent?: string;
  thermalContent?: string;
  isThermalPrinter?: boolean;
  labelData?: Array<{
    id: string;
    name: string;
    selling_price?: number;
    sellingPrice?: number;
    barcode: string;
  }>;
  copies?: number;
  useBackendPrint?: boolean;
  printerName?: string | undefined;
  storeName?: string | undefined;
  labelProfile?: {
    id: string;
    name: string;
  } & Partial<LabelProfile>;
  labelDimensions?: {
    widthMm: number;
    heightMm: number;
  };
}): Promise<void> {
  // Label/barcode printing goes straight through the Tauri Rust command --
  // no Flask involved, so it keeps working whether the sidecar/network is
  // up or not. Was previously a fetch() to the Flask backend's
  // /api/print-label (which generated TSPL server-side in Python); TSPL
  // generation now happens locally in lib/tspl-generator.ts, a verified
  // faithful port of that same Python logic.
  if (useBackendPrint && labelData && labelData.length > 0 && printerName) {
    try {
      const labelDataForTspl = labelData.map(item => ({
        id: item.id,
        name: item.name,
        barcode: item.barcode,
        selling_price: item.selling_price ?? item.sellingPrice ?? 0,
        batchNumber: (item as any).batchNumber || "",
      }));
      const tsplCommands = generateTspl(
        labelDataForTspl,
        copies,
        storeName || "Company Name",
        labelDimensions,
        labelProfile,
      );
      console.log("🖨️ Sending TSPL directly to printer via Tauri:", printerName);
      const result = await invoke<{ status: string; message: string }>("send_tspl_to_printer", {
        printerName,
        tsplCommands,
      });
      if (result.status === "success") {
        console.log("✅ TSPL print succeeded:", result.message);
        return;
      }
      console.warn("⚠️ TSPL print returned non-success, falling back to browser print", result);
    } catch (err) {
      console.error("❌ Error sending TSPL print, falling back to browser print:", err);
    }
  }

  if (htmlContent) {
    console.log("🖨️ Using browser-based HTML printing");
    try {
      // Prefer iframe-based printing even in Tauri; popup windows can be blocked.
      await printInBrowserWindow(htmlContent, false);
    } catch (err) {
      // Fallback for Tauri desktop builds.
      if (isTauriRuntime()) {
        await invoke("print_html", { html: htmlContent });
      } else {
        throw err;
      }
    }
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
    try {
      await printInBrowserWindow(html, false);
    } catch (err) {
      if (isTauriRuntime()) {
        await invoke("print_html", { html });
      } else {
        throw err;
      }
    }
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
