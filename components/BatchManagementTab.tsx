"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PlusCircle, Trash2, Edit, Save, XCircle, Loader2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import useSWR, { mutate } from "swr"

interface Batch {
  id: string
  batchNumber: string
  place: string
  createdAt: string
  updatedAt: string
}

const fetcher = (url: string) => fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}${url}`).then((res) => res.json());

export const BatchManagementTab: React.FC = () => {
  const { data: rawBatches, error, isLoading: isLoadingBatches } = useSWR<Batch[]>("/api/batches", fetcher);
  // Normalize batch fields from backend (handle createdat/createdAt, batch_number/batchNumber variations)
  const batches: Batch[] | undefined = (() => {
    const seenIds = new Set<string>();
    return rawBatches?.map((b: any) => {
      let uniqueId = b.id || b.ID || b._id;

      if (!uniqueId || seenIds.has(uniqueId)) {
        uniqueId = typeof window !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
        // Ensure the newly generated ID is also unique within this mapping session
        while (seenIds.has(uniqueId)) {
          uniqueId = typeof window !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
        }
      }
      seenIds.add(uniqueId);

      const normalized: any = {
        id: uniqueId, // Use the guaranteed unique ID
        batchNumber: b.batchNumber || b.batch_number || b.batchnumber || b.batch || "",
        place: b.place || b.location || b.placeName || "",
        createdAt: b.createdAt || b.createdat || b.created_at || b.created || b.createdAt || null,
        updatedAt: b.updatedAt || b.updatedat || b.updated_at || b.updated || null,
      }
      return normalized as Batch
    });
  })();
  const [newBatchNumber, setNewBatchNumber] = useState("");
  const [newPlace, setNewPlace] = useState("");
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editedBatchNumber, setEditedBatchNumber] = useState("");
  const [editedPlace, setEditedPlace] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const generateBatchNumber = () => {
    const randomString = Math.random().toString(36).substring(2, 8);
    setNewBatchNumber(`btch-${randomString}`);
  };

  const handleAddBatch = async () => {
    if (!newBatchNumber || !newPlace) {
      toast({
        title: "Error",
        description: "Batch number and place are required.",
        variant: "destructive",
      });
      return;
    }

    setIsAdding(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchNumber: newBatchNumber, place: newPlace }),
      });

      if (!response.ok) {
        throw new Error("Failed to add batch");
      }

      toast({
        title: "Success",
        description: "Batch added successfully.",
      });
      setNewBatchNumber("");
      setNewPlace("");
      mutate("/api/batches"); // Re-fetch batches
    } catch (error) {
      console.error("Error adding batch:", error);
      toast({
        title: "Error",
        description: "Failed to add batch. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleEditClick = (batch: Batch) => {
    setEditingBatchId(batch.id);
    setEditedBatchNumber(batch.batchNumber);
    setEditedPlace(batch.place);
  };

  const handleSaveEdit = async (batchId: string) => {
    if (!editedBatchNumber || !editedPlace) {
      toast({
        title: "Error",
        description: "Batch number and place are required.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/batches/${batchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchNumber: editedBatchNumber, place: editedPlace }),
      });

      if (!response.ok) {
        throw new Error("Failed to update batch");
      }

      toast({
        title: "Success",
        description: "Batch updated successfully.",
      });
      setEditingBatchId(null);
      mutate("/api/batches"); // Re-fetch batches
    } catch (error) {
      console.error("Error updating batch:", error);
      toast({
        title: "Error",
        description: "Failed to update batch. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm("Are you sure you want to delete this batch?")) {
      return;
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/batches/${batchId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete batch");
      }

      toast({
        title: "Success",
        description: "Batch deleted successfully.",
      });
      mutate("/api/batches"); // Re-fetch batches
    } catch (error) {
      console.error("Error deleting batch:", error);
      toast({
        title: "Error",
        description: "Failed to delete batch. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoadingBatches) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        <span className="ml-2 text-gray-600">Loading batches...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500">
        Error loading batches: {error.message}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Batch Management</CardTitle>
        <CardDescription>Add, edit, and delete product batches.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add New Batch Section */}
        <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
          <h3 className="text-lg font-semibold">Add New Batch</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="new-batch-number">Batch Number</Label>
              <div className="flex space-x-2">
                <Input
                  id="new-batch-number"
                  value={newBatchNumber}
                  onChange={(e) => setNewBatchNumber(e.target.value)}
                  placeholder="e.g., btch-12dhei"
                  className="flex-1"
                  disabled={isAdding}
                />
                <Button type="button" variant="outline" onClick={generateBatchNumber} disabled={isAdding}>
                  Generate
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-place">Place</Label>
              <Input
                id="new-place"
                value={newPlace}
                onChange={(e) => setNewPlace(e.target.value)}
                placeholder="e.g., Warehouse A"
                disabled={isAdding}
              />
            </div>
          </div>
          <Button onClick={handleAddBatch} disabled={isAdding}>
            {isAdding ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adding...
              </>
            ) : (
              <>
                <PlusCircle className="h-4 w-4 mr-2" /> Add Batch
              </>
            )}
          </Button>
        </div>

        {/* Existing Batches Table */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Existing Batches</h3>
          {batches && batches.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch Number</TableHead>
                    <TableHead>Place</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead>Updated At</TableHead> {/* NEW: Added Updated At column */}
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => (
                    <TableRow key={batch.id}><TableCell className="font-medium">
                        {editingBatchId === batch.id ? (
                          <Input
                            value={editedBatchNumber}
                            onChange={(e) => setEditedBatchNumber(e.target.value)}
                            disabled={isSaving}
                          />
                        ) : (
                          batch.batchNumber || batch.id
                        )}
                      </TableCell><TableCell>
                        {editingBatchId === batch.id ? (
                          <Input
                            value={editedPlace}
                            onChange={(e) => setEditedPlace(e.target.value)}
                            disabled={isSaving}
                          />
                        ) : (
                          batch.place
                        )}
                      </TableCell>
                      <TableCell>{batch.createdAt ? new Date(batch.createdAt).toLocaleDateString() : "-"}</TableCell>
                      <TableCell>
                        {editingBatchId === batch.id ? (
                          <div className="flex space-x-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleSaveEdit(batch.id)}
                              disabled={isSaving}
                            >
                              {isSaving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingBatchId(null)}
                              disabled={isSaving}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="icon" onClick={() => handleEditClick(batch)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteBatch(batch.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-gray-500">No batches found. Add a new batch above.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
