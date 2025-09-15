"use client";

import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { previewPdfFromHtml } from "@/lib/printUtils";

export type PdfPreviewModalProps = {
  open: boolean;
  title?: string;
  html: string; // HTML string to render to PDF for preview
  onOpenChange: (open: boolean) => void;
  onConfirm?: () => void; // called when user clicks Print/Confirm
  confirmLabel?: string;
};

export default function PdfPreviewModal({ open, title, html, onOpenChange, onConfirm, confirmLabel }: PdfPreviewModalProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let urlToRevoke: string | null = null;

    async function build() {
      try {
        const url = await previewPdfFromHtml(html);
        if (!active) return;
        setPdfUrl(url);
        urlToRevoke = url;
      } catch (e) {
        console.error("Failed to build preview PDF:", e);
      }
    }

    if (open) {
      build();
    } else {
      setPdfUrl(null);
    }

    return () => {
      active = false;
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    };
  }, [open, html]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[85vh]">
        <DialogHeader>
          <DialogTitle>{title ?? "Preview"}</DialogTitle>
          <DialogDescription>Review the document before printing.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 border rounded overflow-hidden h-[65vh]">
          {pdfUrl ? (
            <iframe src={pdfUrl} className="w-full h-full" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">Generating preview…</div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {onConfirm && (
            <Button onClick={onConfirm}>{confirmLabel ?? "Print"}</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
