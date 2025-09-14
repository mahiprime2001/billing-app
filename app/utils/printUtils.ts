import { invoke } from "@tauri-apps/api/core";

/**
 * Wraps the provided HTML content by injecting window.print() on body load.
 * This ensures the native print dialog pops up automatically when rendered.
 * @param html The raw HTML string to print.
 * @returns The wrapped HTML string with print auto-trigger.
 */
function wrapHtmlWithPrint(html: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Print Preview</title>
      <style>
        /* Optional: Add your print styles here */
      </style>
    </head>
    <body onload="window.print();">
      ${html}
    </body>
    </html>
  `;
}

/**
 * Opens a new Tauri window, writes the provided HTML content to it, and triggers the print dialog.
 * This function is intended for use within the Tauri desktop application.
 * @param htmlContent The HTML string to display and print.
 */
export async function printWithTauriWindow(htmlContent: string): Promise<void> {
  try {
    // Wrap the HTML content so print triggers automatically on load
    const printableHtml = wrapHtmlWithPrint(htmlContent);
    await invoke("open_print_window", { html: printableHtml });
    console.log("Print window opened and print dialog triggered successfully.");
  } catch (error) {
    console.error("Failed to open new Tauri window for printing:", error);
    throw new Error("Failed to open new window for printing.");
  }
}

/**
 * Handles thermal label printing.
 * @param content The content to print (raw text or label-formatted PDF).
 * @param isThermalPrinter A flag to indicate if the target printer is a thermal printer.
 * @returns A Promise that resolves when the print job is sent.
 */
export async function printThermalLabel(content: string, isThermalPrinter: boolean): Promise<void> {
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
  if (isThermalPrinter && thermalContent) {
    await printThermalLabel(thermalContent, true);
  } else if (htmlContent) {
    await printWithTauriWindow(htmlContent);
  } else {
    throw new Error("No printable content provided.");
  }
}
