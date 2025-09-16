import { open } from '@tauri-apps/api/dialog';
import { writeBinaryFile } from '@tauri-apps/api/fs';
import { documentDir } from '@tauri-apps/api/path';

export async function previewPdfFromHtml(html: string): Promise<string> {
  // Create a blob URL for the HTML content
  const blob = new Blob([html], { type: 'text/html' });
  return URL.createObjectURL(blob);
}

export async function savePdf(blob: Blob, defaultPath = 'document.pdf'): Promise<void> {
  try {
    // Show save dialog
    const filePath = await open({
      defaultPath: await documentDir(),
      filters: [{
        name: 'PDF',
        extensions: ['pdf']
      }]
    }) as string;

    if (!filePath) return; // User cancelled

    // Convert blob to Uint8Array
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Save the file
    await writeBinaryFile(filePath, uint8Array);
  } catch (error) {
    console.error('Error saving PDF:', error);
    throw error;
  }
}
