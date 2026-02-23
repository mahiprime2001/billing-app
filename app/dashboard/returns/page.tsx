"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, XCircle, Clock, Package, User, Phone, MessageSquare, DollarSign, Calendar, History as HistoryIcon } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"

interface ReturnItem {
  // Snake case fields (from JSON)
  s_no?: number;
  return_id?: string;
  product_name?: string;
  product_id?: string;
  customer_name?: string;
  customer_phone_number?: string;
  message?: string;
  refund_method?: "cash" | "upi";
  bill_id?: string;
  item_index?: number;
  return_amount?: number;
  status?: "pending" | "approved" | "rejected" | "completed";
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  return_quantity?: number;
  original_quantity?: number;
  customer_id?: string;
  
  // Camel case fields (from backend conversion)
  sNo?: number;
  returnId?: string;
  productName?: string;
  productId?: string;
  customerName?: string;
  customerPhoneNumber?: string;
  refundMethod?: "cash" | "upi";
  billId?: string;
  itemIndex?: number;
  returnAmount?: number;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  returnQuantity?: number;
  originalQuantity?: number;
  customerId?: string;
}

interface DamagedEvent {
  id: string
  productId?: string
  storeId?: string
  quantity?: number
  reason?: string
  sourceType?: string
  status?: string
  createdAt?: string
  products?: { name?: string; barcode?: string }
}

export default function ReturnsPage() {
  const [pendingReturns, setPendingReturns] = useState<ReturnItem[]>([])
  const [otherReturns, setOtherReturns] = useState<ReturnItem[]>([])
  const [damagedEvents, setDamagedEvents] = useState<DamagedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadReturnsData()
  }, [])

  const loadReturnsData = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/returns`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data: ReturnItem[] = await response.json()
      
      // Filter based on status (check both naming conventions)
      setPendingReturns(data.filter(item => item.status === "pending"))
      setOtherReturns(data.filter(item => item.status !== "pending"))

      const damagedResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/damaged-products`)
      if (damagedResponse.ok) {
        const damagedData = await damagedResponse.json()
        setDamagedEvents(Array.isArray(damagedData) ? damagedData : [])
      }
    } catch (err) {
      console.error("Error loading returns data:", err)
      setError("Failed to load returns data. Please try again later.")
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateReturnStatus = async (returnId: string, status: "approved" | "rejected" | "completed") => {
    if (!confirm(`Are you sure you want to ${status} this return request?`)) {
      return
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/returns/${returnId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      alert(`Return request ${status} successfully!`)
      loadReturnsData() // Reload data to update the lists
    } catch (err) {
      console.error(`Error updating return status to ${status}:`, err)
      alert(`Failed to update return status to ${status}. Please try again.`)
    }
  }

  // Helper functions to get field values (supports both naming conventions)
  const getReturnId = (item: ReturnItem) => item.returnId || item.return_id || ''
  const getProductName = (item: ReturnItem) => item.productName || item.product_name || 'N/A'
  const getCustomerName = (item: ReturnItem) => item.customerName || item.customer_name || 'N/A'
  const getCustomerPhone = (item: ReturnItem) => item.customerPhoneNumber || item.customer_phone_number || 'N/A'
  const getReturnAmount = (item: ReturnItem) => item.returnAmount || item.return_amount || 0
  const getCreatedAt = (item: ReturnItem) => item.createdAt || item.created_at || new Date().toISOString()
  const getUpdatedAt = (item: ReturnItem) => item.updatedAt || item.updated_at || new Date().toISOString()
  const approvedCompletedReturnAmount = otherReturns
    .filter((item) => item.status === "approved" || item.status === "completed")
    .reduce((sum, item) => sum + getReturnAmount(item), 0)
  const totalReturnAmount = [...pendingReturns, ...otherReturns].reduce(
    (sum, item) => sum + getReturnAmount(item),
    0
  )

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Clock className="h-12 w-12 animate-spin mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">Loading returns data...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <XCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <p className="text-red-600">{error}</p>
            <Button onClick={loadReturnsData} className="mt-4">
              Retry
            </Button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Returns Management</h1>
          <p className="text-muted-foreground">Manage product returns and refund requests</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Total Return Amount</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">₹{totalReturnAmount.toFixed(2)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Approved/Completed Amount</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">₹{approvedCompletedReturnAmount.toFixed(2)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Pending Requests</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{pendingReturns.length}</CardContent>
          </Card>
        </div>

        {/* Pending Returns Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              Pending Return Requests
              <Badge variant="secondary" className="ml-2">
                {pendingReturns.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingReturns.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Return ID</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Requested On</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingReturns.map((item) => (
                      <TableRow key={getReturnId(item)}>
                        <TableCell className="font-medium">
                          {getReturnId(item)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-blue-600" />
                            {getProductName(item)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-gray-500" />
                              {getCustomerName(item)}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <Phone className="h-3 w-3" />
                              {getCustomerPhone(item)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 font-semibold text-green-600">
                            ₹{getReturnAmount(item).toFixed(2)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Calendar className="h-4 w-4" />
                            {new Date(getCreatedAt(item)).toLocaleDateString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleUpdateReturnStatus(getReturnId(item), "approved")}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleUpdateReturnStatus(getReturnId(item), "rejected")}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No pending return requests.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Other Returns Section (Approved, Rejected, Completed) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HistoryIcon className="h-5 w-5 text-blue-600" />
              Return History
              <Badge variant="secondary" className="ml-2">
                {otherReturns.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {otherReturns.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Return ID</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {otherReturns.map((item) => (
                      <TableRow key={getReturnId(item)}>
                        <TableCell className="font-medium">
                          {getReturnId(item)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-blue-600" />
                            {getProductName(item)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-gray-500" />
                              {getCustomerName(item)}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <Phone className="h-3 w-3" />
                              {getCustomerPhone(item)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 font-semibold text-green-600">
                            ₹{getReturnAmount(item).toFixed(2)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              item.status === "approved"
                                ? "default"
                                : item.status === "rejected"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {item.status && item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Calendar className="h-4 w-4" />
                            {new Date(getUpdatedAt(item)).toLocaleDateString()}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <HistoryIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No other return requests found.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-rose-600" />
              Damaged Products
              <Badge variant="secondary" className="ml-2">
                {damagedEvents.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {damagedEvents.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event ID</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {damagedEvents.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="font-medium">{event.id}</TableCell>
                        <TableCell>{event.products?.name || event.productId || "N/A"}</TableCell>
                        <TableCell>{event.quantity || 0}</TableCell>
                        <TableCell>{event.sourceType || "N/A"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{event.status || "reported"}</Badge>
                        </TableCell>
                        <TableCell className="max-w-60 truncate">{event.reason || "-"}</TableCell>
                        <TableCell>
                          {event.createdAt ? new Date(event.createdAt).toLocaleDateString() : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No damaged product events found.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
