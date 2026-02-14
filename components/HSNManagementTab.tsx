"use client"

import React, { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PlusCircle, Trash2, Edit, Save, XCircle, Loader2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import useSWR, { mutate } from "swr"

interface HsnCode {
  id: string
  hsnCode: string
  tax: number
  createdAt?: string
}

const fetcher = (url: string) => fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}${url}`).then((res) => res.json())

export const HSNManagementTab: React.FC = () => {
  const { data: rawCodes, error, isLoading } = useSWR("/api/hsn-codes", fetcher)

  const codes: HsnCode[] | undefined = (() => {
    const seenIds = new Set<string>()
    return rawCodes?.map((c: any) => {
      let uniqueId = c.id ?? c.ID ?? c._id
      if (uniqueId === undefined || uniqueId === null || seenIds.has(String(uniqueId))) {
        uniqueId = typeof window !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15)
        while (seenIds.has(String(uniqueId))) {
          uniqueId = typeof window !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15)
        }
      }
      seenIds.add(String(uniqueId))
      return {
        id: String(uniqueId),
        hsnCode: c.hsnCode || c.hsn_code || c.code || "",
        tax: Number(c.tax ?? 0),
        createdAt: c.createdAt || c.created_at || c.created || null,
      }
    })
  })()

  const [newHsnCode, setNewHsnCode] = useState("")
  const [newTax, setNewTax] = useState("0")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editedHsnCode, setEditedHsnCode] = useState("")
  const [editedTax, setEditedTax] = useState("0")
  const [isAdding, setIsAdding] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const handleAdd = async () => {
    if (!newHsnCode.trim()) {
      toast({
        title: "Error",
        description: "HSN code is required.",
        variant: "destructive",
      })
      return
    }
    const parsedTax = Number.parseFloat(newTax)
    if (Number.isNaN(parsedTax) || parsedTax < 0) {
      toast({
        title: "Error",
        description: "Tax must be a valid non-negative number.",
        variant: "destructive",
      })
      return
    }

    setIsAdding(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/hsn-codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hsnCode: newHsnCode.trim(), tax: parsedTax }),
      })

      if (!response.ok) {
        throw new Error("Failed to add HSN code")
      }

      toast({
        title: "Success",
        description: "HSN code added successfully.",
      })
      setNewHsnCode("")
      setNewTax("0")
      mutate("/api/hsn-codes")
    } catch (error) {
      console.error("Error adding HSN code:", error)
      toast({
        title: "Error",
        description: "Failed to add HSN code. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsAdding(false)
    }
  }

  const handleEditClick = (code: HsnCode) => {
    setEditingId(code.id)
    setEditedHsnCode(code.hsnCode)
    setEditedTax(String(code.tax ?? 0))
  }

  const handleSaveEdit = async (hsnId: string) => {
    if (!editedHsnCode.trim()) {
      toast({
        title: "Error",
        description: "HSN code is required.",
        variant: "destructive",
      })
      return
    }
    const parsedTax = Number.parseFloat(editedTax)
    if (Number.isNaN(parsedTax) || parsedTax < 0) {
      toast({
        title: "Error",
        description: "Tax must be a valid non-negative number.",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/hsn-codes/${hsnId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hsnCode: editedHsnCode.trim(), tax: parsedTax }),
      })

      if (!response.ok) {
        throw new Error("Failed to update HSN code")
      }

      toast({
        title: "Success",
        description: "HSN code updated successfully.",
      })
      setEditingId(null)
      mutate("/api/hsn-codes")
    } catch (error) {
      console.error("Error updating HSN code:", error)
      toast({
        title: "Error",
        description: "Failed to update HSN code. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (hsnId: string) => {
    if (!confirm("Are you sure you want to delete this HSN code?")) {
      return
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/hsn-codes/${hsnId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete HSN code")
      }

      toast({
        title: "Success",
        description: "HSN code deleted successfully.",
      })
      mutate("/api/hsn-codes")
    } catch (error) {
      console.error("Error deleting HSN code:", error)
      toast({
        title: "Error",
        description: "Failed to delete HSN code. Please try again.",
        variant: "destructive",
      })
    }
  }

  if (isLoading) {
    return <div>Loading HSN codes...</div>
  }

  if (error) {
    return <div>Error loading HSN codes: {error.message}</div>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>HSN Code Management</CardTitle>
        <CardDescription>Add, edit, and delete HSN codes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-lg font-medium mb-4">Add New HSN Code</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hsnCode">HSN Code</Label>
              <Input
                id="hsnCode"
                value={newHsnCode}
                onChange={(e) => setNewHsnCode(e.target.value)}
                placeholder="e.g., 8471"
                disabled={isAdding}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hsnTax">Tax (%)</Label>
              <Input
                id="hsnTax"
                type="number"
                min="0"
                step="0.01"
                value={newTax}
                onChange={(e) => setNewTax(e.target.value)}
                placeholder="e.g., 18"
                disabled={isAdding}
              />
            </div>
            {isAdding ? (
              <Button disabled className="w-full">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </Button>
            ) : (
              <Button onClick={handleAdd} className="w-full">
                <PlusCircle className="mr-2 h-4 w-4" />
                Add HSN Code
              </Button>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium mb-4">Existing HSN Codes</h3>
          {codes && codes.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                    <TableRow>
                      <TableHead>HSN Code</TableHead>
                      <TableHead>Tax (%)</TableHead>
                      <TableHead>Created At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map((code) => (
                    <TableRow key={code.id}>
                      <TableCell>
                        {editingId === code.id ? (
                          <Input
                            value={editedHsnCode}
                            onChange={(e) => setEditedHsnCode(e.target.value)}
                            className="h-8"
                          />
                        ) : (
                          <span className="font-mono">{code.hsnCode}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingId === code.id ? (
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editedTax}
                            onChange={(e) => setEditedTax(e.target.value)}
                            className="h-8"
                          />
                        ) : (
                          <span>{Number(code.tax ?? 0).toFixed(2)}%</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {code.createdAt ? new Date(code.createdAt).toLocaleDateString() : "N/A"}
                      </TableCell>
                      <TableCell className="text-right">
                        {editingId === code.id ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleSaveEdit(code.id)}
                              disabled={isSaving}
                            >
                              <Save className="h-4 w-4 mr-1" />
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingId(null)}
                              disabled={isSaving}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleEditClick(code)}>
                              <Edit className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDelete(code.id)}>
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-sm text-gray-500">No HSN codes found.</div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
