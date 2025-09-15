/* Unified printing utilities for Tauri + Next.js
 * Supports:
 * - HTML -> PDF (via html2canvas + jsPDF)
 * - Base64 PDF direct printing (high fidelity)
 * - Thermal text/receipt printing
 */

import { invoke } from "@tauri-apps/api/core";

// Lazy imports to avoid SSR issues
let jsPDFLib: any;
let html2canvasLib: any;

export type PrintOptions = {
  printer?: string;
  isThermal?: boolean;
  filename?: string;
};

export async function ensurePdfDepsLoaded() {
  if (!jsPDFLib) {
    const mod = await import("jspdf");
    jsPDFLib = (mod as any).jsPDF || (mod as any).default?.jsPDF || (mod as any).default;
  }
  if (!html2canvasLib) {
    html2canvasLib = (await import("html2canvas")).default as any;
  }
}

// Convert HTML string (or an HTMLElement) to a single/multi page PDF and return base64 string
export async function htmlToBase64Pdf(htmlOrEl: string | HTMLElement, options?: {
  pageSize?: "a4" | "letter" | { widthMm: number; heightMm: number };
  marginMm?: number;
  scale?: number; // rendering scale for html2canvas
}): Promise<string> {
  await ensurePdfDepsLoaded();

  const margin = options?.marginMm ?? 10; // mm
  const scale = options?.scale ?? 2;

  // Create a container element to render HTML when a string is provided
  let element: HTMLElement;
  let cleanup = false;
  if (typeof htmlOrEl === "string") {
    element = document.createElement("div");
    element.style.position = "fixed";
    element.style.left = "-10000px";
    element.style.top = "-10000px";
    element.style.width = "800px"; // reasonable width for rendering
    element.innerHTML = htmlOrEl;
    document.body.appendChild(element);
    cleanup = true;
  } else {
    element = htmlOrEl;
  }

  try {
    const canvas = await html2canvasLib(element, { scale });
    const imgData = canvas.toDataURL("image/png");

    // Page size
    let pageWidthMm = 210; // A4 default width
    let pageHeightMm = 297; // A4 default height
    if (options?.pageSize === "letter") {
      pageWidthMm = 216; pageHeightMm = 279;
    } else if (typeof options?.pageSize === "object") {
      pageWidthMm = options.pageSize.widthMm;
      pageHeightMm = options.pageSize.heightMm;
    }

    const pdf = new jsPDFLib({
      orientation: "portrait",
      unit: "mm",
      format: [pageWidthMm, pageHeightMm],
    });

    // Compute image dimensions to fit inside page with margins
    const contentWidthMm = pageWidthMm - margin * 2;
    const contentHeightMm = pageHeightMm - margin * 2;

    const pxToMm = (px: number) => px * 0.2645833333; // 1px ≈ 0.26458mm
    const imgWidthMm = pxToMm(canvas.width);
    const imgHeightMm = pxToMm(canvas.height);

    let renderWidth = contentWidthMm;
    let renderHeight = (imgHeightMm / imgWidthMm) * renderWidth;

    // Handle multi-page if needed
    if (renderHeight <= contentHeightMm) {
      pdf.addImage(imgData, "PNG", margin, margin, renderWidth, renderHeight);
    } else {
      let remainingHeight = renderHeight;
      let y = margin;
      let pageIndex = 0;

      while (remainingHeight > 0) {
        const sliceHeight = Math.min(contentHeightMm, remainingHeight);
        // For simplicity we add the same image on each page at offset. This is acceptable for receipts/bills.
        if (pageIndex > 0) pdf.addPage([pageWidthMm, pageHeightMm], "portrait");
        pdf.addImage(imgData, "PNG", margin, y, renderWidth, renderHeight);
        remainingHeight -= contentHeightMm;
        pageIndex += 1;
        y = margin; // reset y for next page
      }
    }

    return pdf.output("datauristring").split(",")[1]; // base64 part
  } finally {
    if (cleanup) {
      document.body.removeChild(element);
    }
  }
}

// Print a base64 PDF via Tauri
export async function printBase64Pdf(base64Pdf: string, opts?: PrintOptions) {
  await invoke("print_billing_document", {
    req: {
      base64_pdf: base64Pdf,
      printer: opts?.printer,
      is_thermal: opts?.isThermal ?? false,
      filename: opts?.filename ?? "invoice.pdf",
    },
  });
}

// Print HTML by converting to PDF then sending to Tauri
export async function printHtml(html: string, opts?: PrintOptions & { pageSize?: "a4" | "letter" | { widthMm: number; heightMm: number }; marginMm?: number; scale?: number; }) {
  const base64Pdf = await htmlToBase64Pdf(html, {
    pageSize: opts?.pageSize,
    marginMm: opts?.marginMm,
    scale: opts?.scale,
  });
  await printBase64Pdf(base64Pdf, {
    printer: opts?.printer,
    isThermal: opts?.isThermal,
    filename: opts?.filename ?? "invoice.pdf",
  });
}

// Print thermal receipt as raw text (ESC/POS can be sent here too if needed)
export async function printThermalText(text: string, opts?: PrintOptions) {
  await invoke("print_billing_document", {
    req: {
      text,
      printer: opts?.printer,
      is_thermal: opts?.isThermal ?? true,
      filename: opts?.filename ?? "receipt.txt",
    },
  });
}

// Open browser print preview for a given HTML string.
export async function openBrowserPrintFromHtml(html: string) {
  const w = window.open("", "_blank");
  if (!w) throw new Error("Popup blocked: unable to open print window");
  w.document.open();
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body onload="window.print()">${html}</body></html>`);
  w.document.close();
  // Wait a tick to ensure render
  w.focus();
  setTimeout(() => {
    try { w.print(); } catch {}
  }, 100);
}

// Open browser print preview for a base64 PDF string
export async function openBrowserPrintFromBase64Pdf(b64: string, filename = "document.pdf") {
  const blob = b64ToBlob(b64, "application/pdf");
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) throw new Error("Popup blocked: unable to open PDF print window");
  const handle = () => {
    try { w.print(); } catch {}
    w.removeEventListener("load", handle);
  };
  // Some engines need load listener to trigger print reliably
  try { w.addEventListener("load", handle); } catch { /* noop */ }
}

export async function previewPdfFromHtml(html: string, options?: Parameters<typeof htmlToBase64Pdf>[1]) {
  const b64 = await htmlToBase64Pdf(html, options);
  const blob = b64ToBlob(b64, "application/pdf");
  const url = URL.createObjectURL(blob);
  return url; // caller should open or embed this URL and revoke when done
}

export function b64ToBlob(b64Data: string, contentType = "", sliceSize = 512) {
  const byteCharacters = atob(b64Data);
  const byteArrays = [] as Uint8Array[];

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }

  return new Blob(byteArrays, { type: contentType });
}
