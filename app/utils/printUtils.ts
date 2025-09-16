import { invoke } from "@tauri-apps/api/core";

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
    printWindow.close();
    console.log("Print dialog triggered successfully in browser.");
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
}: {
  htmlContent?: string;
  thermalContent?: string;
  isThermalPrinter?: boolean;
}): Promise<void> {
  const isTauri = typeof window !== "undefined" && !!window.__TAURI__;

  if (isThermalPrinter && thermalContent) {
    if (isTauri) {
      await printThermalLabel(thermalContent, true);
    } else {
      console.warn("Thermal printing is only supported in Tauri desktop application.");
      throw new Error("Thermal printing not available in web environment.");
    }
  } else if (htmlContent) {
    if (isTauri) {
      // Tauri-specific HTML printing (if needed, otherwise can fall back to browser print)
      // For simplicity, we'll use browser print even in Tauri for HTML content unless a specific Tauri API is provided for HTML printing
      await printInBrowserWindow(htmlContent);
    } else {
      await printInBrowserWindow(htmlContent);
    }
  } else {
    throw new Error("No printable content provided.");
  }
}
