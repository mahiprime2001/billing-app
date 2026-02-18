"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Building, Save, User, Shield, RefreshCw, Hash, ShieldCheck, KeyRound } from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
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
import { Package, Trash2 } from "lucide-react"
import { BatchManagementTab } from "@/components/BatchManagementTab"
import { HSNManagementTab } from "@/components/HSNManagementTab"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface SystemSettings {
  gstin: string
  taxPercentage: number
  companyName: string
  companyAddress: string
  companyPhone: string
  companyEmail: string
  id?: number
  last_sync_id?: number
  last_sync_time?: string
}

interface AdminUser {
  id?: string
  name: string
  email: string
  role: "super_admin" | "billing_user"
  assignedStores?: string[]
  twofa?: {
    is_enabled: boolean
    verified_at?: string
    updated_at?: string
  } | null
}



interface UpdateStatus {
  available: boolean
  version?: string
  message: string
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
    id: undefined,
    last_sync_id: undefined,
    last_sync_time: undefined,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [selectedFlushCategory, setSelectedFlushCategory] = useState<"products" | "stores" | "users" | "bills" | "">("")
  const [isFirstConfirmOpen, setIsFirstConfirmOpen] = useState(false)
  const [isSecondConfirmOpen, setIsSecondConfirmOpen] = useState(false)
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])
  const [adminUsersToKeep, setAdminUsersToKeep] = useState<string[]>([])
  const [twofaAdmins, setTwofaAdmins] = useState<AdminUser[]>([])
  const [selectedTwofaUser, setSelectedTwofaUser] = useState<string>("")
  const [qrDataUrl, setQrDataUrl] = useState<string>("")
  const [otpCode, setOtpCode] = useState<string>("")
  const [isGenerating2fa, setIsGenerating2fa] = useState(false)
  const [isVerifying2fa, setIsVerifying2fa] = useState(false)
  const [deletingTwofaUserId, setDeletingTwofaUserId] = useState<string>("")

  const defaultSystemSettings: SystemSettings = {
    gstin: "XX-XXXXX-XXXXX-X",
    taxPercentage: 18,
    companyName: "Your Company Name Pvt Ltd",
    companyAddress: "123 Main St, City, State, ZIP",
    companyPhone: "+91 98765 43210",
    companyEmail: "info@yourcompany.com",
  };
  
  // Update checking states
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false)

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
    fetchAdminUsers()
    fetchSuperAdmins()
  }, [router])

  useEffect(() => {
    if (settings.companyName) { // Only log if settings have been loaded, to avoid initial empty state log
      console.log("Current settings state in component:", JSON.stringify(settings, null, 2));
    }
  }, [settings]); // Depend on settings to log when it changes

  const fetchAdminUsers = async () => {
    try {
      const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/admin-users")
      if (response.ok) {
        const data = await response.json()
        setAdminUsers(data.adminUsers)
      } else {
        console.error("Failed to fetch admin users:", response.statusText)
        toast({
          title: "Error",
          description: "Failed to load admin users for flush option.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Failed to fetch admin users:", error)
      toast({
          title: "Error",
          description: "Failed to load admin users for flush option.",
          variant: "destructive",
      })
    }
  }

  const loadSettings = async () => {
    try {
      const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/settings")
      if (response.ok) {
        const fullData = await response.json();
        console.log("Incoming settings data to frontend:", JSON.stringify(fullData, null, 2)); // Debug log
        
        const fetchedSystemSettings = fullData.systemSettings || {};
        setSettings({
          gstin: fetchedSystemSettings.gstin || defaultSystemSettings.gstin,
          taxPercentage: fetchedSystemSettings.taxpercentage ?? defaultSystemSettings.taxPercentage,
          companyName: fetchedSystemSettings.companyname || defaultSystemSettings.companyName,
          companyAddress: fetchedSystemSettings.companyaddress || defaultSystemSettings.companyAddress,
          companyPhone: fetchedSystemSettings.companyphone || defaultSystemSettings.companyPhone,
          companyEmail: fetchedSystemSettings.companyemail || defaultSystemSettings.companyEmail,
          id: fetchedSystemSettings.id,
          last_sync_id: fetchedSystemSettings.last_sync_id,
          last_sync_time: fetchedSystemSettings.last_sync_time,
        });
      } else {
        // Fallback to default settings if API call fails
        setSettings(defaultSystemSettings);
        console.error("Failed to load settings from API, falling back to defaults:", response.statusText);
      }
    } catch (error) {
      // Fallback to default settings if API call fails
      setSettings(defaultSystemSettings);
      console.error("Failed to load settings:", error);
    }
  }

  const fetchSuperAdmins = async () => {
    try {
      const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/2fa/super-admins")
      if (response.ok) {
        const data = await response.json()
        setTwofaAdmins(data.admins || [])
      } else {
        console.error("Failed to fetch super admins:", response.statusText)
      }
    } catch (error) {
      console.error("Failed to fetch super admins:", error)
    }
  }

  const handleGenerate2fa = async () => {
    if (!selectedTwofaUser) {
      toast({ title: "Select a user", description: "Choose a super admin to set up 2FA." })
      return
    }
    setIsGenerating2fa(true)
    try {
      const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/2fa/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: selectedTwofaUser }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || "Failed to generate 2FA")
      }
      setQrDataUrl(data.qr_data_url || "")
      toast({ title: "2FA created", description: "Scan the QR with any authenticator app." })
      fetchSuperAdmins()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Could not generate 2FA",
        variant: "destructive",
      })
    } finally {
      setIsGenerating2fa(false)
    }
  }

  const handleVerify2fa = async () => {
    if (!selectedTwofaUser || !otpCode) {
      toast({ title: "Missing info", description: "Select a user and enter the OTP." })
      return
    }
    setIsVerifying2fa(true)
    try {
      const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: selectedTwofaUser, code: otpCode }),
      })
      const data = await response.json()
      if (!response.ok || !data.verified) {
        throw new Error(data.message || "Verification failed")
      }
      toast({ title: "Verified", description: "2FA is now enabled for this user." })
      setOtpCode("")
      fetchSuperAdmins()
    } catch (error: any) {
      toast({
        title: "Verification failed",
        description: error.message || "Invalid code",
        variant: "destructive",
      })
    } finally {
      setIsVerifying2fa(false)
    }
  }

  const handleDeleteTwofa = async (userId: string) => {
    setDeletingTwofaUserId(userId)
    try {
      const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/2fa/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || "Failed to delete 2FA")
      }
      toast({ title: "2FA removed", description: "Secret deleted for this user." })
      if (selectedTwofaUser === userId) {
        setQrDataUrl("")
        setOtpCode("")
      }
      fetchSuperAdmins()
    } catch (error: any) {
      toast({
        title: "Delete failed",
        description: error.message || "Could not delete 2FA",
        variant: "destructive",
      })
    } finally {
      setDeletingTwofaUserId("")
    }
  }

  const saveSettings = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemSettings: settings, // `settings` already holds the systemSettings object
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to save settings")
      }

      loadSettings()
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

  // Handle check for updates button click - FIXED VERSION
  const handleCheckForUpdates = async () => {
    console.log('Button clicked, isCheckingUpdate:', isCheckingUpdate);
    
    // Prevent multiple clicks while checking
    if (isCheckingUpdate) {
      console.log('Already checking, returning early');
      return;
    }

    console.log('Starting update check...');
    setIsCheckingUpdate(true);
    setUpdateStatus(null);

    try {
      console.log('Calling invoke...');
      const result = await invoke<string>('check_for_updates');
      console.log('Invoke result:', result);
      
      if (result.includes('Update available')) {
        const version = result.replace('Update available: ', '');
        setUpdateStatus({
          available: true,
          version: version,
          message: `Version ${version} is available!`,
        });
        setIsUpdateDialogOpen(true);
      } else if (result === 'No update available.') {
        setUpdateStatus({
          available: false,
          message: 'You are on the latest version!',
        });
        
        toast({
          title: "No Updates Available",
          description: "You are already running the latest version.",
        });
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
      toast({
        title: "Error",
        description: `Failed to check for updates: ${error}`,
        variant: "destructive",
      });
    } finally {
      console.log('Resetting isCheckingUpdate to false');
      setIsCheckingUpdate(false);
    }
  };

  // Handle install update
  const handleInstallUpdate = async () => {
    try {
      toast({
        title: "Installing Update",
        description: "The update is being downloaded and installed. The application will restart.",
      })
      
      const result = await invoke<string>('install_update')
      
      toast({
        title: "Update Complete",
        description: result,
      })
      
      setUpdateStatus(null)
      setIsUpdateDialogOpen(false)
    } catch (error) {
      console.error('Failed to install update:', error)
      toast({
        title: "Error",
        description: `Failed to install update: ${error}`,
        variant: "destructive",
      })
    }
  }

  const handleInputChange = (field: keyof SystemSettings, value: string | number) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleFlushData = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/flush-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: selectedFlushCategory,
          adminUsersToKeep: selectedFlushCategory === "users" ? adminUsersToKeep : [],
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to flush data")
      }

      toast({
        title: "Data Flushed",
        description: `${selectedFlushCategory} data has been successfully erased.`,
      })
      setSelectedFlushCategory("")
      setAdminUsersToKeep([])
    } catch (error) {
      console.error("Error flushing data:", error)
      toast({
        title: "Error",
        description: "Failed to flush data. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
      setIsFirstConfirmOpen(false)
      setIsSecondConfirmOpen(false)
    }
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

        {/* Application Updates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <RefreshCw className="h-5 w-5 mr-2" />
              Application Updates
            </CardTitle>
            <CardDescription>Keep your application up-to-date with the latest features and improvements</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm text-gray-600 mb-3">
                  Check for the latest version of the application and install updates automatically.
                </p>

                {/* Update Status Message - No Updates */}
                {updateStatus && !updateStatus.available && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-md animate-[fadeIn_0.3s_ease-in]">
                    <div className="flex items-center">
                      <svg
                        className="w-5 h-5 text-green-600 mr-2"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <p className="text-green-800 text-sm font-medium">
                        {updateStatus.message}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <Button 
                onClick={handleCheckForUpdates} 
                disabled={isCheckingUpdate}
                className="ml-4"
                type="button"
              >
                {isCheckingUpdate ? (
                  <>
                    <svg 
                      className="animate-spin -ml-1 mr-2 h-4 w-4" 
                      xmlns="http://www.w3.org/2000/svg" 
                      fill="none" 
                      viewBox="0 0 24 24"
                    >
                      <circle 
                        className="opacity-25" 
                        cx="12" 
                        cy="12" 
                        r="10" 
                        stroke="currentColor" 
                        strokeWidth="4"
                      />
                      <path 
                        className="opacity-75" 
                        fill="currentColor" 
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Checking...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Check for Updates
                  </>
                )}
              </Button>
            </div>

            {/* Update Available Dialog */}
            <AlertDialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center">
                    🎉 Update Available!
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {updateStatus && updateStatus.available && (
                      <div className="space-y-3">
                        <p className="text-base">
                          A new version <span className="font-semibold text-blue-600">{updateStatus.version}</span> is available!
                        </p>
                        <p className="text-sm">
                          Would you like to download and install it now? The application will restart after installation.
                        </p>
                      </div>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Update Later</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleInstallUpdate}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Update Now
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-8">
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
            </CardContent>
          </Card>
        </div>

        {/* Batch Management and Flush Data */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Package className="h-5 w-5 mr-2" />
              Batch Management & Data Utilities
            </CardTitle>
            <CardDescription>Manage product batches and advanced data operations.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="batches" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="batches">
                  <Package className="h-4 w-4 mr-2" />
                  Batch Management
                </TabsTrigger>
                <TabsTrigger value="hsn">
                  <Hash className="h-4 w-4 mr-2" />
                  HSN Codes
                </TabsTrigger>
                <TabsTrigger value="flush">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Flush Data
                </TabsTrigger>
                <TabsTrigger value="twofa">
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  2FA
                </TabsTrigger>
              </TabsList>
              <TabsContent value="batches" className="space-y-6">
                <BatchManagementTab />
              </TabsContent>
              <TabsContent value="hsn" className="space-y-6">
                <HSNManagementTab />
              </TabsContent>

              <TabsContent value="flush" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Trash2 className="h-5 w-5 mr-2" />
                      Flush Data
                    </CardTitle>
                    <CardDescription>Permanently delete data from selected categories.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="flush-category">Select Data Category to Flush</Label>
                      <Select
                        value={selectedFlushCategory}
                        onValueChange={(value: "products" | "stores" | "users" | "bills" | "") =>
                          setSelectedFlushCategory(value)
                        }
                      >
                        <SelectTrigger id="flush-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="products">Products</SelectItem>
                          <SelectItem value="stores">Stores</SelectItem>
                          <SelectItem value="users">Users</SelectItem>
                          <SelectItem value="bills">Bills</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedFlushCategory === "users" && (
                      <div className="space-y-2">
                        <Label>Select Admin Users to Keep</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {adminUsers.map((admin) => (
                            <div key={admin.email} className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id={`admin-${admin.email}`}
                                checked={adminUsersToKeep.includes(admin.email)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setAdminUsersToKeep((prev) => [...prev, admin.email])
                                  } else {
                                    setAdminUsersToKeep((prev) =>
                                      prev.filter((email) => email !== admin.email)
                                    )
                                  }
                                }}
                                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              />
                              <Label htmlFor={`admin-${admin.email}`} className="font-normal">
                                {admin.name} ({admin.email})
                              </Label>
                            </div>
                          ))}
                        </div>
                        <p className="text-sm text-gray-500">
                          Selected admin users will NOT be deleted. All other users will be erased.
                        </p>
                      </div>
                    )}

                    <AlertDialog open={isFirstConfirmOpen} onOpenChange={setIsFirstConfirmOpen}>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="destructive"
                          disabled={!selectedFlushCategory || isLoading}
                          className="w-full"
                        >
                          Flush Selected Data
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete all{" "}
                            <span className="font-bold text-red-600">{selectedFlushCategory}</span> data.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              setIsSecondConfirmOpen(true)
                            }}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Continue
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <AlertDialog open={isSecondConfirmOpen} onOpenChange={setIsSecondConfirmOpen}>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Final Confirmation: Erase Data?</AlertDialogTitle>
                          <AlertDialogDescription>
                            You are about to permanently erase ALL{" "}
                            <span className="font-bold text-red-600">{selectedFlushCategory}</span> data. This
                            includes all associated records in the database. This action is irreversible.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleFlushData}
            className="bg-red-600 hover:bg-red-700"
          >
            I Understand, Erase Data
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

  </CardContent>
</Card>
              </TabsContent>

              <TabsContent value="twofa" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <KeyRound className="h-5 w-5 mr-2" />
                      Two-Factor Authentication
                    </CardTitle>
                    <CardDescription>Enable TOTP-based 2FA for super admin accounts.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="twofa-user">Select super admin</Label>
                      <Select
                        value={selectedTwofaUser}
                        onValueChange={(value) => setSelectedTwofaUser(value)}
                      >
                        <SelectTrigger id="twofa-user">
                          <SelectValue placeholder="Choose a user" />
                        </SelectTrigger>
                        <SelectContent>
                          {twofaAdmins.map((admin) => {
                            const value = admin.id || admin.email
                            return (
                              <SelectItem key={value} value={value}>
                              {admin.name || admin.email} ({admin.email})
                            </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Existing 2FA status</Label>
                      <div className="space-y-2">
                        {twofaAdmins.length === 0 ? (
                          <p className="text-sm text-gray-500">No super admins found.</p>
                        ) : (
                          twofaAdmins.map((admin) => {
                            const status = admin.twofa?.is_enabled ? "Enabled" : admin.twofa ? "Pending verification" : "Not set"
                            const updated = admin.twofa?.updated_at
                            return (
                              <div
                                key={admin.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 bg-gray-50"
                              >
                                <div>
                                  <p className="font-medium">
                                    {admin.name || admin.email} <span className="text-gray-500 text-xs">({admin.email})</span>
                                  </p>
                                  <p className="text-xs text-gray-600">
                                    {status}
                                    {updated ? ` • Updated ${new Date(updated).toLocaleString()}` : ""}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant={admin.twofa?.is_enabled ? "default" : "secondary"}>{status}</Badge>
                                  {admin.twofa && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleDeleteTwofa(admin.id)}
                                      disabled={deletingTwofaUserId === admin.id}
                                    >
                                      {deletingTwofaUserId === admin.id ? "Removing..." : "Delete 2FA"}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button onClick={handleGenerate2fa} disabled={isGenerating2fa || !selectedTwofaUser}>
                        {isGenerating2fa ? "Generating..." : "Generate 2FA"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleVerify2fa}
                        disabled={isVerifying2fa || !otpCode || !selectedTwofaUser}
                      >
                        {isVerifying2fa ? "Verifying..." : "Verify Code"}
                      </Button>
                    </div>

                    <div className="space-y-3">
                      <Label>Scan QR in your authenticator app</Label>
                      {qrDataUrl ? (
                        <div className="flex items-center space-x-4">
                          <img src={qrDataUrl} alt="2FA QR" className="w-40 h-40 border rounded-lg" />
                          <p className="text-sm text-gray-600 max-w-md">
                            Use Google Authenticator, Authy, 1Password, or any TOTP app. After scanning, enter the 6‑digit code below to verify.
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">Generate to view QR.</p>
                      )}
                    </div>

                    <div className="space-y-2 max-w-xs">
                      <Label htmlFor="otp">Enter 6-digit code</Label>
                      <Input
                        id="otp"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="123456"
                        maxLength={6}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
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

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </DashboardLayout>
  )
}
