"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type PrinterSectionProps = {
  printer?: string;
  isThermal?: boolean;
  onChange: (next: { printer?: string; isThermal?: boolean }) => void;
  className?: string;
};

export default function PrinterSection({ printer, isThermal, onChange, className }: PrinterSectionProps) {
  return (
    <div className={className}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="printer-name">Printer name (optional)</Label>
          <Input
            id="printer-name"
            placeholder="Default system printer"
            value={printer ?? ""}
            onChange={(e) => onChange({ printer: e.target.value || undefined, isThermal })}
          />
          <p className="text-xs text-gray-500">
            Leave blank to use the OS default printer.
          </p>
        </div>

        <div className="flex items-center space-x-3 mt-6 md:mt-8">
          <Switch
            id="thermal-switch"
            checked={!!isThermal}
            onCheckedChange={(checked) => onChange({ printer, isThermal: checked })}
          />
          <Label htmlFor="thermal-switch">Thermal printer</Label>
        </div>
      </div>
    </div>
  );
}
