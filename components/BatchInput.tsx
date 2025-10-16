"use client"

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import useSWR from "swr"; // NEW

interface BatchInputProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  // onSave: (batchNumber: string, place: string) => void; // REMOVED
}

const fetcher = (url: string) => fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}${url}`).then((res) => res.json()); // NEW

export const BatchInput: React.FC<BatchInputProps> = ({ isOpen, onOpenChange }) => { // MODIFIED
  const { mutate } = useSWR("/api/batches", fetcher); // NEW
  const [batchNumber, setBatchNumber] = useState("");
  const [place, setPlace] = useState("");

  const generateBatchNumber = () => { // NEW
    const randomString = Math.random().toString(36).substring(2, 8); // 6 random alphanumeric characters
    setBatchNumber(`btch-${randomString}`);
  };

  const handleSave = async () => { // MODIFIED to async
    if (batchNumber && place) {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/batches`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchNumber, place }),
        });

        if (!response.ok) {
          throw new Error("Failed to add batch");
        }

        mutate(); // Re-fetch batches after adding a new one
        setBatchNumber("");
        setPlace("");
        onOpenChange(false);
      } catch (error) {
        console.error("Error adding batch:", error);
        alert("Failed to add batch.");
      }
    } else {
      alert("Please fill in both batch number and place.");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Batch</DialogTitle>
          <DialogDescription>
            Enter the batch number and place for the new batch.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="batch-number">Batch Number</Label>
            <div className="flex space-x-2">
              <Input
                id="batch-number"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                placeholder="e.g., btch-12dhei"
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={generateBatchNumber}> {/* NEW */}
                Generate
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="place">Place</Label>
            <Input
              id="place"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="e.g., Warehouse A"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Batch</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
