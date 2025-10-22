"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Settings, Building, Receipt, Save, User, Shield, FileText, Eye } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Package } from "lucide-react" // NEW: Import Package icon
import { BatchManagementTab } from "@/components/BatchManagementTab" // NEW: Import BatchManagementTab component

interface SystemSettings {
  gstin: string
  taxPercentage: number
  companyName: string
  companyAddress: string
  companyPhone: string
  companyEmail: string
}

interface AdminUser {
  name: string
  email: string
  role: "super_admin" | "billing_user"
  assignedStores?: string[]
}

interface BillFormat {
  width: number
  height: number | "auto"
  margins: {
    top: number
    bottom: number
    left: number
    right: number
  }
  unit: string
}

interface SystemStore {
  id: string
  name: string
  address: string
  phone?: string
  status: string
}

export default function SettingsPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null)
  const [settings, setSettings] = useState<SystemSettings>({
    gstin: "",
    taxPercentage: 0,
    companyName: "",
    companyAddress: "",
    companyPhone: "",
    companyEmail: "",
  })
  const [billFormats, setBillFormats] = useState<Record<string, BillFormat>>({})
  const [storeFormats, setStoreFormats] = useState<Record<string, string>>({})
  const [selectedFormat, setSelectedFormat] = useState("A4")
  const [showPreview, setShowPreview] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const isLoggedIn = localStorage.getItem("adminLoggedIn")
    const userData = localStorage.getItem("adminUser")

    if (isLoggedIn !== "true" || !userData) {
      router.push("/")
      return
    }

    const user = JSON.parse(userData)
    setCurrentUser(user)

    if (user.role !== "super_admin") {
      router.push("/dashboard")
      return
    }

    loadSettings()
  }, [router])

  const loadSettings = async () => {
    try {
      const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/settings")
      if (response.ok) {
        const data = await response.json()
        if (data.systemSettings) setSettings(data.systemSettings)
        if (data.billFormats) setBillFormats(data.billFormats)
        if (data.storeFormats) setStoreFormats(data.storeFormats)
      }
    } catch (error) {
      console.error("Failed to load settings:", error)
    }
  }

  const saveSettings = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemSettings: settings,
          billFormats,
          storeFormats,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to save settings")
      }

      loadSettings(); // Reload settings after successful save
      toast({
        title: "Settings Saved",
        description: "System settings have been updated successfully.",
      })
    } catch (error) {
      console.error("Error saving settings:", error)
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (field: keyof SystemSettings, value: string | number) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const updateBillFormat = (formatName: string, updates: Partial<BillFormat>) => {
    setBillFormats((prev) => ({
      ...prev,
      [formatName]: { ...prev[formatName], ...updates },
    }))
  }

  const updateFormatMargins = (formatName: string, margin: string, value: number) => {
    setBillFormats((prev) => ({
      ...prev,
      [formatName]: {
        ...prev[formatName],
        margins: {
          ...prev[formatName].margins,
          [margin]: value,
        },
      },
    }))
  }

  const assignFormatToStore = (storeId: string, formatName: string) => {
    setStoreFormats((prev) => ({
      ...prev,
      [storeId]: formatName,
    }))
  }

  const generatePreview = (formatName: string) => {
    const format = billFormats[formatName]
    const scale = formatName.includes("Thermal") ? 2 : 0.5

    return (
      <div className="border rounded-lg p-4 bg-white shadow-sm">
        <div className="text-center mb-4">
          <h4 className="font-semibold text-lg">{formatName} Preview</h4>
          <p className="text-sm text-gray-500">
            {format.width}mm × {format.height === "auto" ? "Auto" : `${format.height}mm`}
          </p>
        </div>

        <div
          className="border border-gray-300 bg-white mx-auto relative"
          style={{
            width: `${format.width * scale}px`,
            minHeight: formatName.includes("Thermal")
              ? "200px"
              : `${typeof format.height === "number" ? format.height * scale : 200}px`,
            padding: `${format.margins.top * scale}px ${format.margins.right * scale}px ${format.margins.bottom * scale}px ${format.margins.left * scale}px`,
          }}
        >
          {/* Header */}
          <div className="text-center mb-2">
            <div className="font-bold text-xs">{settings.companyName}</div>
            <div className="text-xs">Sample Store</div>
            <div className="text-xs">Sample Address</div>
            <div className="text-xs">GSTIN: {settings.gstin}</div>
          </div>

          {/* Bill Details */}
          <div className="flex justify-between text-xs mb-2">
            <span>Bill: #SAMPLE</span>
            <span>Date: {new Date().toLocaleDateString()}</span>
          </div>

          {/* Customer */}
          <div className="text-xs mb-2">
            <div>Phone: +91 98765 43210</div>
            <div>Customer: Sample Customer</div>
          </div>

          {/* Items */}
          <div className="border-t border-b py-1 mb-2">
            <div className="flex justify-between text-xs font-semibold">
              <span>Item</span>
              <span>Qty</span>
              <span>Price</span>
              <span>Total</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>Sample Product</span>
              <span>2</span>
              <span>₹500</span>
              <span>₹1000</span>
            </div>
          </div>

          {/* Totals */}
          <div className="text-xs space-y-1">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>₹1000.00</span>
            </div>
            <div className="flex justify-between">
              <span>Tax ({settings.taxPercentage}%):</span>
              <span>₹{((1000 * settings.taxPercentage) / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold border-t pt-1">
              <span>Total:</span>
              <span>₹{(1000 + (1000 * settings.taxPercentage) / 100).toFixed(2)}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-xs mt-2">
            <div>Thank you for your business!</div>
          </div>
        </div>
      </div>
    )
  }

  if (!currentUser) {
    return <div>Loading...</div>
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">System Settings</h1>
            <p className="text-gray-600 mt-2">Configure system-wide settings and business information</p>
          </div>
          <Button onClick={saveSettings} disabled={isLoading} className="bg-green-600 hover:bg-green-700 shadow-lg">
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? "Saving..." : "Save Settings"}
          </Button>
        </div>

        {/* User Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="h-5 w-5 mr-2" />
              Current User
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Shield className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <div className="font-medium text-lg">{currentUser.name}</div>
                <div className="text-gray-500">{currentUser.email}</div>
                <Badge className="mt-1 bg-red-100 text-red-800">Super Administrator</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Company Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Building className="h-5 w-5 mr-2" />
                Company Information
              </CardTitle>
              <CardDescription>Basic company details that appear on bills and documents</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  value={settings.companyName}
                  onChange={(e) => handleInputChange("companyName", e.target.value)}
                  placeholder="Enter company name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyAddress">Company Address</Label>
                <Input
                  id="companyAddress"
                  value={settings.companyAddress}
                  onChange={(e) => handleInputChange("companyAddress", e.target.value)}
                  placeholder="Enter company address"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyPhone">Phone Number</Label>
                  <Input
                    id="companyPhone"
                    value={settings.companyPhone}
                    onChange={(e) => handleInputChange("companyPhone", e.target.value)}
                    placeholder="Enter phone number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyEmail">Email Address</Label>
                  <Input
                    id="companyEmail"
                    type="email"
                    value={settings.companyEmail}
                    onChange={(e) => handleInputChange("companyEmail", e.target.value)}
                    placeholder="Enter email address"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tax & Legal Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Receipt className="h-5 w-5 mr-2" />
                Tax & Legal Settings
              </CardTitle>
              <CardDescription>Configure tax rates and legal information for billing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="gstin">GSTIN Number</Label>
                <Input
                  id="gstin"
                  value={settings.gstin}
                  onChange={(e) => handleInputChange("gstin", e.target.value)}
                  placeholder="Enter GSTIN number"
                  className="font-mono"
                />
                <p className="text-sm text-gray-500">Goods and Services Tax Identification Number</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="taxPercentage">Tax Percentage (%)</Label>
                <Input
                  id="taxPercentage"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={settings.taxPercentage}
                  onChange={(e) => handleInputChange("taxPercentage", Number.parseFloat(e.target.value) || 0)}
                  placeholder="Enter tax percentage"
                />
                <p className="text-sm text-gray-500">Default tax rate applied to all bills</p>
              </div>

              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium mb-2 text-blue-800">Tax Calculation Preview</h4>
                <div className="text-sm text-blue-700 space-y-1">
                  <div className="flex justify-between">
                    <span>Sample Amount:</span>
                    <span>₹1,000.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax ({settings.taxPercentage}%):</span>
                    <span>₹{((1000 * settings.taxPercentage) / 100).toFixed(2)}</span>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between font-medium">
                    <span>Total Amount:</span>
                    <span>₹{(1000 + (1000 * settings.taxPercentage) / 100).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bill Format Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="h-5 w-5 mr-2" />
              Bill Format Settings
            </CardTitle>
            <CardDescription>Configure bill printing dimensions and formats for different stores</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="formats" className="w-full">
              <TabsList className="grid w-full grid-cols-4"> {/* MODIFIED: grid-cols-4 for new tab */}
                <TabsTrigger value="formats">Bill Formats</TabsTrigger>
                <TabsTrigger value="stores">Store Assignment</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="batches">
                  <Package className="h-4 w-4 mr-2" /> {/* NEW: Icon for Batch Management */}
                  Batch Management
                </TabsTrigger>
              </TabsList>

              <TabsContent value="formats" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {Object.entries(billFormats).map(([formatName, format]) => (
                    <Card key={formatName}>
                      <CardHeader>
                        <CardTitle className="text-lg">{formatName.replace("_", " ")}</CardTitle>
                        <CardDescription>
                          {format.width}mm × {format.height === "auto" ? "Auto Height" : `${format.height}mm`}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Width (mm)</Label>
                            <Input
                              type="number"
                              value={format.width}
                              onChange={(e) => updateBillFormat(formatName, { width: Number(e.target.value) })}
                              disabled={formatName !== "Custom"}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Height (mm)</Label>
                            <Input
                              type="number"
                              value={format.height === "auto" ? "" : format.height}
                              onChange={(e) =>
                                updateBillFormat(formatName, { height: Number(e.target.value) || "auto" })
                              }
                              placeholder="Auto"
                              disabled={formatName !== "Custom" && formatName.includes("Thermal")}
                            />
                          </div>
                        </div>

                        <div className="space-y-3">
                          <Label className="text-sm font-medium">Margins (mm)</Label>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label className="text-xs">Top</Label>
                              <Input
                                type="number"
                                value={format.margins.top}
                                onChange={(e) => updateFormatMargins(formatName, "top", Number(e.target.value))}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs">Bottom</Label>
                              <Input
                                type="number"
                                value={format.margins.bottom}
                                onChange={(e) => updateFormatMargins(formatName, "bottom", Number(e.target.value))}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs">Left</Label>
                              <Input
                                type="number"
                                value={format.margins.left}
                                onChange={(e) => updateFormatMargins(formatName, "left", Number(e.target.value))}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs">Right</Label>
                              <Input
                                type="number"
                                value={format.margins.right}
                                onChange={(e) => updateFormatMargins(formatName, "right", Number(e.target.value))}
                                className="h-8"
                              />
                            </div>
                          </div>
                        </div>

                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" className="w-full bg-transparent">
                              <Eye className="h-4 w-4 mr-2" />
                              Preview Format
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>{formatName.replace("_", " ")} Preview</DialogTitle>
                              <DialogDescription>Preview of how bills will appear in this format</DialogDescription>
                            </DialogHeader>
                            <div className="max-h-96 overflow-auto">{generatePreview(formatName)}</div>
                          </DialogContent>
                        </Dialog>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="stores" className="space-y-6">
                <div className="space-y-4">
                  <div className="text-sm text-gray-600">
                    Assign specific bill formats to different stores. Each store can have its own printing format.
                  </div>

                  {Object.keys(storeFormats).map((storeId) => (
                    <Card key={storeId}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium">{storeId}</h4>
                          </div>
                          <div className="w-48">
                            <Select
                              value={storeFormats[storeId] || "A4"}
                              onValueChange={(value) => assignFormatToStore(storeId, value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select format" />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.keys(billFormats).map((formatName) => (
                                  <SelectItem key={formatName} value={formatName}>
                                    {formatName.replace("_", " ")}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="preview" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {Object.keys(billFormats).map((formatName) => (
                    <div key={formatName}>{generatePreview(formatName)}</div>
                  ))}
                </div>
              </TabsContent>

              {/* NEW: Batch Management Tab Content */}
              <TabsContent value="batches" className="space-y-6">
                <BatchManagementTab />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Settings Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Settings className="h-5 w-5 mr-2" />
              Settings Preview
            </CardTitle>
            <CardDescription>Preview how your settings will appear on bills and documents</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed border-gray-300 p-6 bg-gray-50 rounded-lg">
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold">{settings.companyName}</h3>
                <p className="text-sm text-gray-600">{settings.companyAddress}</p>
                <div className="flex justify-center space-x-4 text-sm text-gray-600">
                  <span>Phone: {settings.companyPhone}</span>
                  <span>Email: {settings.companyEmail}</span>
                </div>
                <p className="text-sm font-mono">GSTIN: {settings.gstin}</p>
                <div className="mt-4 p-3 bg-white rounded border">
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>₹1,000.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tax ({settings.taxPercentage}%):</span>
                      <span>₹{((1000 * settings.taxPercentage) / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold border-t pt-1">
                      <span>Total:</span>
                      <span>₹{(1000 + (1000 * settings.taxPercentage) / 100).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={saveSettings}
            disabled={isLoading}
            size="lg"
            className="bg-green-600 hover:bg-green-700 shadow-lg"
          >
            <Save className="h-5 w-5 mr-2" />
            {isLoading ? "Saving Settings..." : "Save All Settings"}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  )
}
