"use client";

import { useEffect, useState } from "react";
import { unifiedPrint } from "@/app/utils/printUtils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

interface PrintButtonProps {
  htmlContent?: string;
  base64Pdf?: string;
  thermalContent?: string;
  isThermalPrinter?: boolean;
  onPrintSuccess?: () => void;
  onPrintError?: (error: Error) => void;
}

export default function PrintButton({
  htmlContent,
  base64Pdf,
  thermalContent,
  isThermalPrinter = false,
  onPrintSuccess,
  onPrintError,
}: PrintButtonProps) {
  const [isTauri, setIsTauri] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).__TAURI__) {
      setIsTauri(true);
    }
  }, []);

  const handlePrint = async () => {
    console.log("PrintButton: handlePrint called.");
    console.log("PrintButton: isTauri =", isTauri);
    console.log("PrintButton: htmlContent =", htmlContent ? "present" : "absent");
    console.log("PrintButton: base64Pdf =", base64Pdf ? "present" : "absent");
    console.log("PrintButton: thermalContent =", thermalContent ? "present" : "absent");
    console.log("PrintButton: isThermalPrinter =", isThermalPrinter);

    if (!isTauri) {
      toast({
        title: "Printing Not Available",
        description: "Tauri environment not detected. Printing is only available in the desktop application.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await unifiedPrint({ htmlContent, base64Pdf, thermalContent, isThermalPrinter });
      toast({
        title: "Print Job Sent",
        description: "Your document has been sent to the printer.",
      });
      onPrintSuccess?.();
    } catch (error: any) {
      toast({
        title: "Printing Failed",
        description: error.message || "An unknown error occurred while sending the print job.",
        variant: "destructive",
      });
      onPrintError?.(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button onClick={handlePrint} disabled={!isTauri || isLoading}>
      {isLoading ? "Printing..." : "Print Document"}
    </Button>
  );
}
