"use client";

import { useEffect, useState } from "react";
import { unifiedPrint } from "@/app/utils/printUtils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

interface PrintButtonProps {
  htmlContent?: string;
  thermalContent?: string;
  isThermalPrinter?: boolean;
  onPrintSuccess?: () => void;
  onPrintError?: (error: Error) => void;
}

export default function PrintButton({
  htmlContent,
  thermalContent,
  isThermalPrinter = false,
  onPrintSuccess,
  onPrintError,
}: PrintButtonProps) {
  const [isTauri, setIsTauri] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handlePrint = async () => {
    console.log("PrintButton: handlePrint called.");
    console.log("PrintButton: htmlContent =", htmlContent ? "present" : "absent");
    console.log("PrintButton: thermalContent =", thermalContent ? "present" : "absent");
    console.log("PrintButton: isThermalPrinter =", isThermalPrinter);

    if (!htmlContent && !thermalContent) {
      toast({
        title: "No Content to Print",
        description: "Please provide HTML or thermal content to print.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await unifiedPrint({ htmlContent, thermalContent, isThermalPrinter });
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
    <Button onClick={handlePrint} disabled={isLoading || (!htmlContent && !thermalContent)}>
      {isLoading ? "Printing..." : "Print Document"}
    </Button>
  );
}
