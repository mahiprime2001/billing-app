"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, XCircle, Clock, Package, User, Phone, MessageSquare, DollarSign, Calendar, History as HistoryIcon } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"

interface ReturnItem {
  s_no: number;
  return_id: string;
  product_name: string;
  product_id: string;
  customer_name: string;
  customer_phone_number: string;
  message: string;
  refund_method: "cash" | "upi";
  bill_id: string;
  item_index: number;
  return_amount: number;
  status: "pending" | "approved" | "rejected" | "completed";
  created_by: string;
  created_at: string;
  updated_at: string;
}

export default function ReturnsPage() {
  const [pendingReturns, setPendingReturns] = useState<ReturnItem[]>([])
  const [otherReturns, setOtherReturns] = useState<ReturnItem[]>([])
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
      
      setPendingReturns(data.filter(item => item.status === "pending"))
      setOtherReturns(data.filter(item => item.status !== "pending"))
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

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </DashboardLayout>
    )
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="text-red-500 text-center py-8">{error}</div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <h1 className="text-4xl font-bold text-gray-900">Returns Management</h1>

        {/* Pending Returns Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Clock className="h-5 w-5 mr-2 text-yellow-600" />
              Pending Return Requests
              <Badge variant="outline" className="ml-2 bg-yellow-100 text-yellow-800">
                {pendingReturns.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingReturns.length > 0 ? (
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
                    <TableRow key={item.return_id}>
                      <TableCell className="font-medium">{item.return_id}</TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <Package className="h-4 w-4 mr-1 text-gray-500" />
                          {item.product_name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <User className="h-4 w-4 mr-1 text-gray-500" />
                          {item.customer_name}
                        </div>
                        <div className="flex items-center text-sm text-gray-500">
                          <Phone className="h-3 w-3 mr-1" />
                          {item.customer_phone_number}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <DollarSign className="h-4 w-4 mr-1 text-green-600" />
                          ₹{item.return_amount.toFixed(2)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center text-sm text-gray-500">
                          <Calendar className="h-3 w-3 mr-1" />
                          {new Date(item.created_at).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUpdateReturnStatus(item.return_id, "approved")}
                          >
                            <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
                            Approve
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleUpdateReturnStatus(item.return_id, "rejected")}
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
            ) : (
              <p className="text-gray-500 text-center py-8">No pending return requests.</p>
            )}
          </CardContent>
        </Card>

        {/* Other Returns Section (Approved, Rejected, Completed) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <HistoryIcon className="h-5 w-5 mr-2 text-blue-600" />
              Return History
              <Badge variant="outline" className="ml-2 bg-blue-100 text-blue-800">
                {otherReturns.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {otherReturns.length > 0 ? (
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
                    <TableRow key={item.return_id}>
                      <TableCell className="font-medium">{item.return_id}</TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <Package className="h-4 w-4 mr-1 text-gray-500" />
                          {item.product_name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <User className="h-4 w-4 mr-1 text-gray-500" />
                          {item.customer_name}
                        </div>
                        <div className="flex items-center text-sm text-gray-500">
                          <Phone className="h-3 w-3 mr-1" />
                          {item.customer_phone_number}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <DollarSign className="h-4 w-4 mr-1 text-green-600" />
                          ₹{item.return_amount.toFixed(2)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            item.status === "approved"
                              ? "bg-green-100 text-green-800"
                              : item.status === "rejected"
                              ? "bg-red-100 text-red-800"
                              : "bg-blue-100 text-blue-800"
                          }
                        >
                          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center text-sm text-gray-500">
                          <Calendar className="h-3 w-3 mr-1" />
                          {new Date(item.updated_at).toLocaleDateString()}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-gray-500 text-center py-8">No other return requests found.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
