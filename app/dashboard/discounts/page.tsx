"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Calendar, CheckCircle, Clock, FileText, History as HistoryIcon, Percent, User, XCircle } from "lucide-react"

type DiscountStatus = "pending" | "approved" | "rejected"

type DiscountRequest = {
  s_no?: number
  discount_id?: string
  user_id?: string
  discount?: number
  discount_amount?: number
  bill_id?: string
  status?: DiscountStatus
  created_at?: string
  updated_at?: string
  discountId?: string
  userId?: string
  discountAmount?: number
  billId?: string
  createdAt?: string
  updatedAt?: string
}

export default function DiscountsPage() {
  const [requests, setRequests] = useState<DiscountRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadDiscounts()
  }, [])

  const loadDiscounts = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/discounts`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data: DiscountRequest[] = await response.json()
      setRequests(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error("Error loading discounts:", err)
      setError("Failed to load discounts. Please try again later.")
    } finally {
      setLoading(false)
    }
  }

  const pendingRequests = useMemo(
    () => requests.filter((item) => (item.status || "").toLowerCase() === "pending"),
    [requests],
  )
  const approvedRequests = useMemo(
    () => requests.filter((item) => (item.status || "").toLowerCase() === "approved"),
    [requests],
  )

  const getDiscountId = (item: DiscountRequest) => item.discountId || item.discount_id || ""
  const getBillId = (item: DiscountRequest) => item.billId || item.bill_id || "-"
  const getUserId = (item: DiscountRequest) => item.userId || item.user_id || "-"
  const getDiscountPercent = (item: DiscountRequest) => item.discount ?? 0
  const getDiscountAmount = (item: DiscountRequest) =>
    item.discountAmount ?? item.discount_amount ?? 0
  const getCreatedAt = (item: DiscountRequest) => item.createdAt || item.created_at || new Date().toISOString()
  const getUpdatedAt = (item: DiscountRequest) => item.updatedAt || item.updated_at || new Date().toISOString()

  const handleDecision = async (requestId: string, status: "approved" | "rejected") => {
    if (!confirm(`Are you sure you want to ${status} this discount request?`)) {
      return
    }
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/discounts/${requestId}/status`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      )
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      alert(`Discount request ${status} successfully!`)
      loadDiscounts()
    } catch (err) {
      console.error(`Error updating discount status to ${status}:`, err)
      alert(`Failed to update discount status to ${status}. Please try again.`)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Discount Requests</h1>
          <p className="text-muted-foreground">Approve or decline discount requests tied to invoices.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              Requested Discounts
              <Badge variant="secondary" className="ml-2">
                {pendingRequests.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-gray-500">
                <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300 animate-spin" />
                <p>Loading discounts...</p>
              </div>
            ) : error ? (
              <div className="text-center py-12 text-gray-500">
                <XCircle className="h-12 w-12 mx-auto mb-4 text-red-400" />
                <p className="text-red-600">{error}</p>
                <Button onClick={loadDiscounts} className="mt-4">
                  Retry
                </Button>
              </div>
            ) : pendingRequests.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Request ID</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Requested By</TableHead>
                      <TableHead>Discount</TableHead>
                      <TableHead>Requested On</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRequests.map((item) => (
                      <TableRow key={getDiscountId(item)}>
                        <TableCell className="font-medium">{getDiscountId(item)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-blue-600" />
                            {getBillId(item)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-500" />
                            {getUserId(item)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 font-semibold text-green-600">
                            <Percent className="h-4 w-4" />
                            {getDiscountPercent(item).toFixed(1)}% (Rs. {getDiscountAmount(item).toFixed(2)})
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
                              onClick={() => handleDecision(getDiscountId(item), "approved")}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDecision(getDiscountId(item), "rejected")}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Decline
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
                <p>No pending discount requests.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HistoryIcon className="h-5 w-5 text-blue-600" />
              Approved Discounts
              <Badge variant="secondary" className="ml-2">
                {approvedRequests.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-gray-500">
                <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300 animate-spin" />
                <p>Loading discounts...</p>
              </div>
            ) : error ? (
              <div className="text-center py-12 text-gray-500">
                <XCircle className="h-12 w-12 mx-auto mb-4 text-red-400" />
                <p className="text-red-600">{error}</p>
                <Button onClick={loadDiscounts} className="mt-4">
                  Retry
                </Button>
              </div>
            ) : approvedRequests.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Request ID</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Requested By</TableHead>
                      <TableHead>Discount</TableHead>
                      <TableHead>Approved On</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approvedRequests.map((item) => (
                      <TableRow key={getDiscountId(item)}>
                        <TableCell className="font-medium">{getDiscountId(item)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-blue-600" />
                            {getBillId(item)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-500" />
                            {getUserId(item)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 font-semibold text-green-600">
                            <Percent className="h-4 w-4" />
                            {getDiscountPercent(item).toFixed(1)}% (Rs. {getDiscountAmount(item).toFixed(2)})
                          </div>
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
                <p>No approved discounts yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
