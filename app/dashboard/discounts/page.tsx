"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Calendar, CheckCircle, Clock, FileText, History as HistoryIcon, Percent, Trash2, User, XCircle } from "lucide-react"

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
  userName?: string
  discountAmount?: number
  billId?: string
  createdAt?: string
  updatedAt?: string
  approved_by?: string
  approvedBy?: string
  approvedByName?: string
}

type UserInfo = {
  id?: string
  user_id?: string
  name?: string
  fullName?: string
  full_name?: string
}

export default function DiscountsPage() {
  const [requests, setRequests] = useState<DiscountRequest[]>([])
  const [userNameById, setUserNameById] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adminUser, setAdminUser] = useState<{ id?: string; userId?: string; name?: string }>({})
  const [selectedDiscountIds, setSelectedDiscountIds] = useState<string[]>([])

  useEffect(() => {
    const storedAdmin = localStorage.getItem("adminUser")
    if (storedAdmin) {
      try {
        setAdminUser(JSON.parse(storedAdmin))
      } catch {
        // ignore parse errors and continue without admin context
      }
    }
    loadDiscounts()
    loadUsers()

    const intervalId = setInterval(() => {
      loadDiscounts(false)
      loadUsers()
    }, 5000)

    return () => clearInterval(intervalId)
  }, [])

  const loadDiscounts = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true)
    }
    setError(null)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/discounts?t=${Date.now()}`, {
        cache: "no-store",
      })
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

  const loadUsers = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/users?t=${Date.now()}`, {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data: UserInfo[] = await response.json()
      const userMap = (Array.isArray(data) ? data : []).reduce<Record<string, string>>((acc, user) => {
        const userId = user.id || user.user_id
        const userName = user.name || user.fullName || user.full_name
        if (userId && userName) {
          acc[userId] = userName
        }
        return acc
      }, {})
      setUserNameById(userMap)
    } catch (err) {
      console.error("Error loading users:", err)
      setUserNameById({})
    }
  }

  const formatDate = (value: string) => new Date(value).toLocaleDateString()
  const formatTime = (value: string) =>
    new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

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
<<<<<<< HEAD
  const getUserName = (item: DiscountRequest) =>
    item.userName || (item as any).user_name || item.userId || item.user_id || "-"
=======
  const getUserId = (item: DiscountRequest) => item.userId || item.user_id || "-"
  const getUserDisplayName = (item: DiscountRequest) => {
    const userId = getUserId(item)
    return userNameById[userId] || userId
  }
>>>>>>> 3cfe1d7771b106db27c032749a5370170e339fbb
  const getDiscountPercent = (item: DiscountRequest) => item.discount ?? 0
  const getDiscountAmount = (item: DiscountRequest) =>
    item.discountAmount ?? item.discount_amount ?? 0
  const getCreatedAt = (item: DiscountRequest) => item.createdAt || item.created_at || new Date().toISOString()
  const getUpdatedAt = (item: DiscountRequest) => item.updatedAt || item.updated_at || new Date().toISOString()
  const getApprovedBy = (item: DiscountRequest) =>
    item.approvedByName ||
    (item as any).approved_by_name ||
    item.approvedBy ||
    item.approved_by ||
    "-"

  useEffect(() => {
    const validIds = new Set(requests.map((item) => getDiscountId(item)))
    setSelectedDiscountIds((prev) => prev.filter((id) => validIds.has(id)))
  }, [requests])

  const toggleDiscountSelection = (discountId: string, checked: boolean) => {
    if (!discountId) return
    setSelectedDiscountIds((prev) => {
      if (checked) {
        return prev.includes(discountId) ? prev : [...prev, discountId]
      }
      return prev.filter((id) => id !== discountId)
    })
  }

  const toggleSelectAll = (checked: boolean, list: DiscountRequest[]) => {
    const ids = list.map((item) => getDiscountId(item)).filter(Boolean)
    if (!ids.length) return
    setSelectedDiscountIds((prev) => {
      if (checked) {
        const merged = new Set([...prev, ...ids])
        return Array.from(merged)
      }
      return prev.filter((id) => !ids.includes(id))
    })
  }

  const deleteDiscounts = async (ids: string[]) => {
    const filteredIds = ids.filter(Boolean)
    if (filteredIds.length === 0) return

    const confirmMsg =
      filteredIds.length === 1
        ? `Delete discount ${filteredIds[0]} permanently?`
        : `Delete ${filteredIds.length} discounts permanently?`
    if (!confirm(confirmMsg)) return

    try {
      const endpoint =
        filteredIds.length === 1
          ? `/api/discounts/${filteredIds[0]}`
          : `/api/discounts/bulk-delete`

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}${endpoint}`, {
        method: filteredIds.length === 1 ? "DELETE" : "POST",
        headers: filteredIds.length === 1 ? undefined : { "Content-Type": "application/json" },
        body: filteredIds.length === 1 ? undefined : JSON.stringify({ ids: filteredIds }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      alert("Discount(s) deleted successfully.")
      setSelectedDiscountIds((prev) => prev.filter((id) => !filteredIds.includes(id)))
      loadDiscounts()
    } catch (err) {
      console.error("Error deleting discounts:", err)
      alert("Failed to delete discounts. Please try again.")
    }
  }

  const pendingSelectedIds = selectedDiscountIds.filter((id) =>
    pendingRequests.some((item) => getDiscountId(item) === id),
  )
  const approvedSelectedIds = selectedDiscountIds.filter((id) =>
    approvedRequests.some((item) => getDiscountId(item) === id),
  )

  const pendingSelectAllChecked =
    pendingRequests.length > 0 &&
    pendingRequests.every((item) => selectedDiscountIds.includes(getDiscountId(item)))
  const pendingSelectSome =
    !pendingSelectAllChecked &&
    pendingRequests.some((item) => selectedDiscountIds.includes(getDiscountId(item)))

  const approvedSelectAllChecked =
    approvedRequests.length > 0 &&
    approvedRequests.every((item) => selectedDiscountIds.includes(getDiscountId(item)))
  const approvedSelectSome =
    !approvedSelectAllChecked &&
    approvedRequests.some((item) => selectedDiscountIds.includes(getDiscountId(item)))

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
          body: JSON.stringify({
            status,
            approved_by: status === "approved" ? adminUser?.id || adminUser?.userId || null : null,
          }),
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
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              Requested Discounts
              <Badge variant="secondary" className="ml-2">
                {pendingRequests.length}
              </Badge>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadDiscounts}>
                Refresh
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={pendingSelectedIds.length === 0}
                onClick={() => deleteDiscounts(pendingSelectedIds)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete Selected {pendingSelectedIds.length > 0 ? `(${pendingSelectedIds.length})` : ""}
              </Button>
            </div>
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
                      <TableHead className="w-12">
                        <Checkbox
                          checked={pendingSelectAllChecked || (pendingSelectSome ? "indeterminate" : false)}
                          onCheckedChange={(checked) => toggleSelectAll(checked === true, pendingRequests)}
                          aria-label="Select all pending discounts"
                        />
                      </TableHead>
                      <TableHead>Request ID</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Requested By</TableHead>
                      <TableHead>Approved By</TableHead>
                      <TableHead>Discount</TableHead>
                      <TableHead>Requested On</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRequests.map((item) => (
                      <TableRow key={getDiscountId(item)}>
                        <TableCell>
                          <Checkbox
                            checked={selectedDiscountIds.includes(getDiscountId(item))}
                            onCheckedChange={(checked) =>
                              toggleDiscountSelection(getDiscountId(item), checked === true)
                            }
                            aria-label={`Select discount ${getDiscountId(item)}`}
                          />
                        </TableCell>
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
<<<<<<< HEAD
                            {getUserName(item)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-500" />
                            -
=======
                            {getUserDisplayName(item)}
>>>>>>> 3cfe1d7771b106db27c032749a5370170e339fbb
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
                            <div>
                              <div>{formatDate(getCreatedAt(item))}</div>
                              <div className="text-xs text-gray-400">{formatTime(getCreatedAt(item))}</div>
                            </div>
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
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => deleteDiscounts([getDiscountId(item)])}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
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
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <HistoryIcon className="h-5 w-5 text-blue-600" />
              Approved Discounts
              <Badge variant="secondary" className="ml-2">
                {approvedRequests.length}
              </Badge>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadDiscounts}>
                Refresh
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={approvedSelectedIds.length === 0}
                onClick={() => deleteDiscounts(approvedSelectedIds)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete Selected {approvedSelectedIds.length > 0 ? `(${approvedSelectedIds.length})` : ""}
              </Button>
            </div>
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
                      <TableHead className="w-12">
                        <Checkbox
                          checked={approvedSelectAllChecked || (approvedSelectSome ? "indeterminate" : false)}
                          onCheckedChange={(checked) => toggleSelectAll(checked === true, approvedRequests)}
                          aria-label="Select all approved discounts"
                        />
                      </TableHead>
                      <TableHead>Request ID</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Requested By</TableHead>
                      <TableHead>Discount</TableHead>
                      <TableHead>Approved By</TableHead>
                      <TableHead>Approved On</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approvedRequests.map((item) => (
                      <TableRow key={getDiscountId(item)}>
                        <TableCell>
                          <Checkbox
                            checked={selectedDiscountIds.includes(getDiscountId(item))}
                            onCheckedChange={(checked) =>
                              toggleDiscountSelection(getDiscountId(item), checked === true)
                            }
                            aria-label={`Select discount ${getDiscountId(item)}`}
                          />
                        </TableCell>
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
<<<<<<< HEAD
                            {getUserName(item)}
=======
                            {getUserDisplayName(item)}
>>>>>>> 3cfe1d7771b106db27c032749a5370170e339fbb
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 font-semibold text-green-600">
                            <Percent className="h-4 w-4" />
                            {getDiscountPercent(item).toFixed(1)}% (Rs. {getDiscountAmount(item).toFixed(2)})
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-500" />
                            {getApprovedBy(item)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Calendar className="h-4 w-4" />
                            <div>
                              <div>{formatDate(getUpdatedAt(item))}</div>
                              <div className="text-xs text-gray-400">{formatTime(getUpdatedAt(item))}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteDiscounts([getDiscountId(item)])}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </Button>
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
