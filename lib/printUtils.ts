import { invoke } from '@tauri-apps/api/core';

// Type declaration for Tauri globals (optional)
declare global {
  interface Window {
    __TAURI__?: {
      invoke: typeof invoke;
    };
  }
}

/**
 * Converts HTML content to plain text by extracting innerText.
 * Adjust or extend this function if you need basic styling
 * (e.g., bold, underline) via ASCII control codes.
 */
function extractText(htmlContent: string): string {
  const container = document.createElement('div');
  container.innerHTML = htmlContent;
  return container.innerText || '';
}

/**
 * Sends the extracted text directly to the thermal printer via Tauri.
 */
export async function printHtml(htmlContent: string): Promise<void> {
  const text = extractText(htmlContent);

  try {
    // Invoke the Rust print command
    await invoke('print_to_thermal_printer', {
      printerName: 'TT0650',  // Your TVS LP 46 DLite identifier
      content: text,
      paperWidth: 80,         // in millimeters
      paperHeight: 12         // in millimeters
    });
    console.log('Print job sent to thermal printer.');
  } catch (err) {
    console.error('Thermal print failed, falling back to browser print:', err);
    // Fallback to browser printing if needed
    await browserPrint(htmlContent);
  }
}

/**
 * Browser print fallback (Edge/Chrome will use system dialog).
 */
async function browserPrint(htmlContent: string): Promise<void> {
  try {
    const printWindow = window.open('', '_blank');
    if (!printWindow) throw new Error('Failed to open print window.');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Document</title>
        <style>
          body { margin: 0; padding: 0px; font-family: Arial, sans-serif; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>${htmlContent}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 100);
    };
    console.log('Browser print triggered.');
  } catch (error) {
    console.error('Browser printing failed:', error);
  }
}
