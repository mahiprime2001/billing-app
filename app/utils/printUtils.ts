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
}: {
  htmlContent?: string;
  thermalContent?: string;
  isThermalPrinter?: boolean;
  productIds?: string[]; // Type for product IDs
  copies?: number; // Type for copies
  useBackendPrint?: boolean; // Type for backend print flag
}): Promise<void> {
  const isTauri = typeof window !== "undefined" && !!window.__TAURI__;

  if (useBackendPrint && productIds && productIds.length > 0) {
    // Call backend API for printing
    try {
      const backendApiUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';
      const response = await fetch(`${backendApiUrl}/api/print-label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productIds: productIds,
          copies: copies,
        }),
      });
      const data = await response.json();
      if (data.status === 'success') {
        console.log("Print job sent to backend successfully:", data.message);
        alert("Print job sent successfully"); // Provide user feedback
      } else {
        console.error("Backend print failed:", data.message);
        alert(`Print failed: ${data.message}`); // Provide user feedback
        throw new Error(`Backend print failed: ${data.message}`);
      }
    } catch (error: unknown) {
      console.error("Error calling backend print API:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Error sending print job: ${errorMessage}`); // Provide user feedback
      throw new Error(`Error sending print job: ${errorMessage}`);
    }
  } else if (isThermalPrinter && thermalContent) {
    if (isTauri) {
      await printThermalLabel(thermalContent, true);
    } else {
      console.warn("Thermal printing is only supported in Tauri desktop application.");
      throw new Error("Thermal printing not available in web environment.");
    }
  } else if (htmlContent) {
    if (isTauri) {
      // Use custom Tauri command for HTML content preparation, then trigger browser print
      try {
        await invoke("print_html_document", { html_content: htmlContent });
        console.log("HTML content sent to backend for preparation. Triggering browser print.");
        await printInBrowserWindow(htmlContent); // Trigger browser print after backend preparation
      } catch (error) {
        console.error("Failed to prepare HTML content via custom Tauri command, falling back to direct browser print:", error);
        await printInBrowserWindow(htmlContent);
      }
    } else {
      await printInBrowserWindow(htmlContent);
    }
  } else {
    throw new Error("No printable content provided.");
  }
}
