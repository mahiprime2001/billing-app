import { invoke } from "@tauri-apps/api/core";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Generates a PDF from HTML content.
 * @param htmlContent The HTML string to convert to PDF.
 * @returns A Promise that resolves with the Base64 encoded PDF string.
 */
export async function generatePdfFromHtml(htmlContent: string): Promise<string> {
  const tempElement = document.createElement("div");
  tempElement.innerHTML = htmlContent;
  document.body.appendChild(tempElement);

  try {
    const canvas = await html2canvas(tempElement, {
      scale: 2, // Increase scale for better quality
      useCORS: true, // Enable CORS for images
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
    });

    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
    return pdf.output("datauristring").split(",")[1]; // Return base64 string
  } catch (error) {
    console.error("Error generating PDF from HTML:", error);
    throw new Error("Failed to generate PDF from HTML.");
  } finally {
    document.body.removeChild(tempElement);
  }
}

/**
 * Prints a Base64 encoded PDF using the Tauri backend.
 * @param base64Pdf The Base64 encoded PDF string.
 * @returns A Promise that resolves when the print job is sent.
 */
export async function printBase64Pdf(base64Pdf: string): Promise<void> {
  try {
    await invoke("print_billing_document", { base64Pdf });
    console.log("Base64 PDF sent to printer successfully.");
  } catch (error) {
    console.error("Failed to print Base64 PDF:", error);
    throw error;
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
    // For thermal printing, we might send raw text directly to a specific printer.
    // This would require a new Tauri command or a more sophisticated printing solution.
    // For now, we'll simulate sending raw text by invoking a generic print command
    // or by converting the text to a simple PDF if the backend only handles PDFs.
    // A more robust solution would involve a dedicated thermal print command in Rust.
    await invoke("print_thermal_document", { content }); // Assuming a new Tauri command for thermal printing
    console.log("Thermal label content sent to printer successfully.");
  } catch (error) {
    console.error("Failed to print thermal label:", error);
    throw error;
  }
}

/**
 * Unified printing function that handles different print scenarios.
 * @param options An object containing printing options.
 * @param options.htmlContent Optional HTML content for PDF generation (fallback).
 * @param options.base64Pdf Optional Base64 encoded PDF for high-fidelity printing.
 * @param options.thermalContent Optional content for thermal printing.
 * @param options.isThermalPrinter Optional flag to indicate if the target printer is a thermal printer.
 * @returns A Promise that resolves when the print job is completed.
 */
export async function unifiedPrint({
  htmlContent,
  base64Pdf,
  thermalContent,
  isThermalPrinter = false,
}: {
  htmlContent?: string;
  base64Pdf?: string;
  thermalContent?: string;
  isThermalPrinter?: boolean;
}): Promise<void> {
  if (isThermalPrinter && thermalContent) {
    await printThermalLabel(thermalContent, true);
  } else if (base64Pdf) {
    await printBase64Pdf(base64Pdf);
  } else if (htmlContent) {
    const generatedPdf = await generatePdfFromHtml(htmlContent);
    await printBase64Pdf(generatedPdf);
  } else {
    throw new Error("No printable content provided.");
  }
}
