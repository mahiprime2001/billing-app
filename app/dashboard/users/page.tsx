"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Edit, Trash2, Users, Shield, User, Clock, Search, Eye, EyeOff } from "lucide-react"

interface AdminUser {
  id: string
  name: string
  email: string
  password: string
  role: "super_admin" | "billing_user" | "temporary_user"
  assignedStores?: string[]
  sessionDuration?: number // hours for temporary users
  createdat: string
  updatedAt: string
  status: "active" | "inactive"
}

interface SystemStore {
  id: string
  name: string
  address: string
  status: string
}

export default function UsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [stores, setStores] = useState<SystemStore[]>([])
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  // Form states
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "billing_user" as AdminUser["role"],
    assignedStores: [] as string[],
    sessionDuration: 24,
    status: "active" as AdminUser["status"],
  })

  useEffect(() => {
    const isLoggedIn = localStorage.getItem("adminLoggedIn")
    const userData = localStorage.getItem("adminUser")

    if (isLoggedIn !== "true" || !userData) {
      router.push("/")
      return
    }

    const user = JSON.parse(userData)
    setCurrentUser(user)

    loadUsers()
    loadStores()
  }, [router])

  const loadUsers = async () => {
    try {
      const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/users")
      if (response.ok) {
        const data = await response.json()
        setUsers(data)
      } else {
        console.error("Failed to fetch users")
      }
    } catch (error) {
      console.error("Error fetching users:", error)
    }
  }

  const loadStores = async () => {
    try {
      const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/stores")
      if (response.ok) {
        const data = await response.json()
        setStores(data)
      } else {
        console.error("Failed to fetch stores")
      }
    } catch (error) {
      console.error("Error fetching stores:", error)
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      password: "",
      role: "billing_user",
      assignedStores: [],
      sessionDuration: 24,
      status: "active",
    })
  }

  const generatePassword = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*();'./,?<>"
    let password = ""
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setFormData({ ...formData, password })
  }

  const handleAddUser = async () => {
    if (!formData.name || !formData.email || !formData.password) {
      alert("Please fill in all required fields")
      return
    }

    // Validate store assignment for billing users
    if (formData.role === "billing_user" && formData.assignedStores.length === 0) {
      alert("Please assign at least one store for billing users")
      return
    }

    try {
      const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
          assignedStores: formData.role === "billing_user" ? formData.assignedStores : undefined,
          sessionDuration: formData.role === "temporary_user" ? formData.sessionDuration : undefined,
          status: formData.status,
        }),
      })

      if (response.ok) {
        loadUsers()
        resetForm()
        setIsAddDialogOpen(false)
      } else {
        const error = await response.json()
        alert(error.message || "Failed to add user")
      }
    } catch (error) {
      console.error("Error adding user:", error)
      alert("An error occurred while adding the user")
    }
  }

  const handleEditUser = async () => {
    if (!editingUser || !formData.name || !formData.email) {
      alert("Please fill in all required fields (Name, Email)")
      return
    }

    // Validate store assignment for billing users
    if (formData.role === "billing_user" && formData.assignedStores.length === 0) {
      alert("Please assign at least one store for billing users")
      return
    }

    const payload: Partial<AdminUser> = {
      name: formData.name,
      email: formData.email,
      role: formData.role,
      assignedStores: formData.role === "billing_user" ? formData.assignedStores : undefined,
      sessionDuration: formData.role === "temporary_user" ? formData.sessionDuration : undefined,
      status: formData.status,
    };

    // Only include password in payload if it's not empty
    if (formData.password) {
      payload.password = formData.password;
    }

    try {
      const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + `/api/users/${editingUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        loadUsers()
        resetForm()
        setEditingUser(null)
        setIsEditDialogOpen(false)
      } else {
        const error = await response.json()
        alert(error.message || "Failed to update user")
      }
    } catch (error) {
      console.error("Error updating user:", error)
      alert("An error occurred while updating the user")
    }
  }

  const handleDeleteUser = async (userId: string) => {
    // Prevent deleting the current user
    if (currentUser?.email === users.find((u) => u.id === userId)?.email) {
      alert("You cannot delete your own account")
      return
    }

    try {
      const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + `/api/users/${userId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        loadUsers()
      } else {
        const error = await response.json()
        alert(error.message || "Failed to delete user")
      }
    } catch (error) {
      console.error("Error deleting user:", error)
      alert("An error occurred while deleting the user")
    }
  }

  // This function is no longer used, replaced by handleOpenEditDialog for better password handling
  // const openEditDialog = (user: AdminUser) => {
  //   setEditingUser(user)
  //   setIsEditDialogOpen(true)
  //   setShowPassword(true)

  //   console.log("User object in openEditDialog:", user);
  //   console.log("User password in openEditDialog:", user.password);

  //   setFormData({
  //     name: user.name,
  //     email: user.email,
  //     password: user.password || "",
  //     role: user.role,
  //     // Ensure assignedStores are correctly initialized for editing
  //     assignedStores: user.assignedStores || [],
  //     sessionDuration: user.sessionDuration || 24,
  //     status: user.status,
  //   });
  // };

  // Function to handle opening the edit dialog and setting form data
const handleOpenEditDialog = (user: AdminUser) => {
  setEditingUser(user);
  setIsEditDialogOpen(true);
  setShowPassword(false);
  
  console.log("--- Opening Edit Dialog ---");
  console.log("User being edited:", {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    assignedStores: user.assignedStores,
    status: user.status,
    password: user.password,
  });
  console.log("All available stores for context:", stores.map(s => ({ id: s.id, name: s.name, status: s.status })));

  setFormData((prevFormData) => {
    // Ensure assignedStores is always an array
    let assignedStoresArray: string[] = [];
    
    if (user.assignedStores) {
      if (Array.isArray(user.assignedStores)) {
        assignedStoresArray = user.assignedStores;
      } else if (typeof user.assignedStores === 'string') {
        // If it's a string, split by comma or keep as single item
        const storeString = user.assignedStores as string;
        assignedStoresArray = storeString.includes(',') 
          ? storeString.split(',').map((s: string) => s.trim())
          : [storeString];
      }
    }
    
    const newFormData = {
      ...prevFormData,
      name: user.name,
      email: user.email,
      password: user.password || "", // FIXED: Show existing password
      role: user.role,
      assignedStores: assignedStoresArray, // FIXED: Ensure it's always an array
      sessionDuration: user.sessionDuration || 24,
      status: user.status,
    };
    
    console.log("FormData after setting:", newFormData);
    console.log("AssignedStores type:", typeof newFormData.assignedStores, "Is array:", Array.isArray(newFormData.assignedStores));
    console.log("AssignedStores value:", newFormData.assignedStores);
    
    return newFormData;
  });
};



  const toggleStoreAssignment = (storeId: string) => {
    setFormData((prev) => ({
      ...prev,
      assignedStores: prev.assignedStores.includes(storeId)
        ? prev.assignedStores.filter((id) => id !== storeId)
        : [...prev.assignedStores, storeId],
    }))
  }

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = roleFilter === "all" || user.role === roleFilter
    const matchesStatus = statusFilter === "all" || user.status === statusFilter

    return matchesSearch && matchesRole && matchesStatus
  })

  const getRoleInfo = (role: AdminUser["role"]) => {
    switch (role) {
      case "super_admin":
        return { label: "Super Admin", variant: "default" as const, icon: Shield, color: "text-blue-600" }
      case "billing_user":
        return { label: "Billing User", variant: "secondary" as const, icon: User, color: "text-green-600" }
      case "temporary_user":
        return { label: "Temporary User", variant: "outline" as const, icon: Clock, color: "text-orange-600" }
      default:
        // Fallback for unknown roles
        return { label: "Unknown Role", variant: "destructive" as const, icon: User, color: "text-gray-500" }
    }
  }

  const getStatusInfo = (status: AdminUser["status"]) => {
    return status === "active"
      ? { label: "Active", variant: "default" as const }
      : { label: "Inactive", variant: "secondary" as const }
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
            <p className="text-gray-600 mt-2">Manage admin users and their permissions</p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
                <DialogDescription>Create a new admin user account</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Enter full name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="Enter email address"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password *</Label>
                  <div className="flex space-x-2">
                    <div className="relative flex-1">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        placeholder="Enter password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-gray-400" />
                        ) : (
                          <Eye className="h-4 w-4 text-gray-400" />
                        )}
                      </Button>
                    </div>
                    <Button type="button" variant="outline" onClick={generatePassword}>
                      Generate
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="role">Role *</Label>
                    <Select
                      value={formData.role}
                      onValueChange={(value: AdminUser["role"]) => setFormData({ ...formData, role: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="super_admin">Super Admin</SelectItem>
                        <SelectItem value="billing_user">Billing User</SelectItem>
                        <SelectItem value="temporary_user">Temporary User</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status *</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value: AdminUser["status"]) => setFormData({ ...formData, status: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Store Assignment for Billing Users */}
                {formData.role === "billing_user" && (
                  <div className="space-y-2">
                    <Label>Assigned Stores *</Label>
                    <div className="border rounded-lg p-3 max-h-32 overflow-y-auto">
                      {stores
                        .filter((store) => store.status === "active")
                        .map((store) => (
                          <div key={store.id} className="flex items-center space-x-2 py-1">
                            <Checkbox
                              id={`store-${store.id}`}
                              checked={formData.assignedStores.includes(store.id)}
                              onCheckedChange={() => toggleStoreAssignment(store.id)}
                            />
                            <Label htmlFor={`store-${store.id}`} className="text-sm">
                              {store.name}
                            </Label>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Session Duration for Temporary Users */}
                {formData.role === "temporary_user" && (
                  <div className="space-y-2">
                    <Label htmlFor="sessionDuration">Session Duration (hours)</Label>
                    <Input
                      id="sessionDuration"
                      type="number"
                      min="1"
                      max="168"
                      value={formData.sessionDuration}
                      onChange={(e) => setFormData({ ...formData, sessionDuration: Number(e.target.value) || 24 })}
                      placeholder="24"
                    />
                    <p className="text-xs text-gray-500">
                      How long the temporary user session should last (1-168 hours)
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsAddDialogOpen(false)
                    resetForm()
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleAddUser}>Add User</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Users</p>
                  <p className="text-2xl font-bold text-gray-900">{users.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Shield className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Super Admins</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {users.filter((u) => u.role === "super_admin").length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <User className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Billing Users</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {users.filter((u) => u.role === "billing_user").length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Clock className="h-8 w-8 text-orange-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Temporary Users</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {users.filter((u) => u.role === "temporary_user").length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <Card>
          <CardHeader>
            <CardTitle>User Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="billing_user">Billing User</SelectItem>
                  <SelectItem value="temporary_user">Temporary User</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Users Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium">User</th>
                    <th className="text-left p-4 font-medium">Role</th>
                    <th className="text-left p-4 font-medium">Status</th>
                    <th className="text-left p-4 font-medium">Assigned Stores</th>
                    <th className="text-left p-4 font-medium">Session Duration</th>
                    <th className="text-left p-4 font-medium">Created</th>
                    <th className="text-left p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const roleInfo = getRoleInfo(user.role)
                    const statusInfo = getStatusInfo(user.status)
                    const RoleIcon = roleInfo.icon
                    return (
                      <tr key={user.id} className="border-b hover:bg-gray-50">
                        <td className="p-4">
                          <div>
                            <div className="font-medium">{user.name}</div>
                            <div className="text-sm text-gray-500">{user.email}</div>
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge variant={roleInfo.variant} className="flex items-center w-fit">
                            <RoleIcon className={`h-3 w-3 mr-1 ${roleInfo.color}`} />
                            {roleInfo.label}
                          </Badge>
                        </td>
                        <td className="p-4">
                          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        </td>
                        <td className="p-4">
                          {user.assignedStores && user.assignedStores.length > 0 ? (
                            <div className="space-y-1">
                              {user.assignedStores.map((storeId) => {
  const store = stores.find((s) => s.id === storeId)
  return store ? (
    <div key={storeId} className="text-xs bg-gray-100 px-2 py-1 rounded">
      {store.name}
    </div>
  ) : null
})}

                              {user.assignedStores.length > 2 && (
                                <span className="text-xs text-gray-500">+{user.assignedStores.length - 2} more</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="p-4">
                          {user.sessionDuration ? (
                            <span className="text-sm">{user.sessionDuration}h</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="p-4">
                          <span className="text-sm text-gray-500">{new Date(user.createdat).toLocaleDateString()}</span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center space-x-2">
                            <Button variant="outline" size="sm" onClick={() => handleOpenEditDialog(user)}>
                              <Edit className="h-3 w-3" />
                            </Button>
                            {currentUser?.email !== user.email && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700 bg-transparent"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete User</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete "{user.name}"? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteUser(user.id)}
                                      className="bg-red-600 hover:bg-red-700"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {filteredUsers.length === 0 && (
                <div className="text-center py-12">
                  <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-xl font-medium text-gray-900 mb-2">No users found</h3>
                  <p className="text-gray-500 mb-4">
                    {searchTerm || roleFilter !== "all" || statusFilter !== "all"
                      ? "Try adjusting your search or filters"
                      : "Get started by adding your first user"}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Edit User Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>Update user information and permissions</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Full Name *</Label>
                  <Input
                    id="edit-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter full name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email *</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Enter email address"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-password">Password *</Label>
                <div className="flex space-x-2">
                  <div className="relative flex-1">
                    <Input
                      id="edit-password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Leave blank to keep existing password, or enter new password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400" />
                      )}
                    </Button>
                  </div>
                  <Button type="button" variant="outline" onClick={generatePassword}>
                    Generate
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  Leave the password field blank to keep the current password. Enter a new password to change it.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-role">Role *</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value: AdminUser["role"]) => setFormData({ ...formData, role: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                      <SelectItem value="billing_user">Billing User</SelectItem>
                      <SelectItem value="temporary_user">Temporary User</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-status">Status *</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value: AdminUser["status"]) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Store Assignment for Billing Users */}
              {formData.role === "billing_user" && (
                <div className="space-y-2">
                  <Label>Assigned Stores *</Label>
                  <div className="border rounded-lg p-3 max-h-32 overflow-y-auto">
                    {stores
                      .filter((store) => store.status === "active")
                      .map((store) => (
                        <div key={store.id} className="flex items-center space-x-2 py-1">
                          <Checkbox
                            id={`edit-store-${store.id}`}
                            checked={formData.assignedStores.includes(store.id)}
                            onCheckedChange={() => toggleStoreAssignment(store.id)}
                          />
                          <Label htmlFor={`edit-store-${store.id}`} className="text-sm">
                            {store.name}
                          </Label>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Session Duration for Temporary Users */}
              {formData.role === "temporary_user" && (
                <div className="space-y-2">
                  <Label htmlFor="edit-sessionDuration">Session Duration (hours)</Label>
                  <Input
                    id="edit-sessionDuration"
                    type="number"
                    min="1"
                    max="168"
                    value={formData.sessionDuration}
                    onChange={(e) => setFormData({ ...formData, sessionDuration: Number(e.target.value) || 24 })}
                    placeholder="24"
                  />
                  <p className="text-xs text-gray-500">How long the temporary user session should last (1-168 hours)</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false)
                  resetForm()
                  setEditingUser(null)
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleEditUser}>Update User</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}
