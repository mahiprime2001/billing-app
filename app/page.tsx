"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Eye, EyeOff, Lock, Mail, AlertCircle, CheckCircle, ArrowLeft, Shield, User, Clock } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface AdminUser {
  id: string
  username: string
  name: string
  email: string
  phone?: string
  role: "super_admin" | "billing_user" | "temporary_user"
  permissions: string[]
  assignedStores?: string[]
  isTemporary?: boolean
  sessionId?: string
  createdAt: string
  lastLogin?: string
  password?: string
}

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // Login form state
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [rememberEmail, setRememberEmail] = useState(false)

  // Forgot password state
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState("")
  const [resetStep, setResetStep] = useState(1)
  const [resetCode, setResetCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState("")
  const [resetSuccess, setResetSuccess] = useState("")

  useEffect(() => {
    // Initialize default admin first
    initializeDefaultAdmin()

    // Check if user is already logged in
    const isLoggedIn = localStorage.getItem("adminLoggedIn")
    if (isLoggedIn === "true") {
      const userData = localStorage.getItem("adminUser")
      if (userData) {
        try {
          const user = JSON.parse(userData)
          if (user.isTemporary) {
            router.push("/billing")
          } else {
            router.push("/dashboard")
          }
        } catch (error) {
          console.error("Error parsing user data:", error)
          localStorage.removeItem("adminLoggedIn")
          localStorage.removeItem("adminUser")
        }
      }
    }

    // Load remembered email
    const rememberedEmail = localStorage.getItem("rememberedEmail")
    if (rememberedEmail) {
      setEmail(rememberedEmail)
      setRememberEmail(true)
    }
  }, [router])

  const initializeDefaultAdmin = () => {
    try {
      // Always reinitialize for demo purposes to ensure users exist
      const defaultUsers: AdminUser[] = [
        {
          id: "admin_1",
          username: "admin",
          name: "System Administrator",
          email: "admin@siriartjewellery.com",
          phone: "+91 98765 43210",
          role: "super_admin",
          permissions: ["all"],
          password: "admin123",
          createdAt: new Date().toISOString(),
        },
        {
          id: "billing_1",
          username: "billing",
          name: "Billing User",
          email: "billing@siriartjewellery.com",
          phone: "+91 98765 43211",
          role: "billing_user",
          permissions: ["billing", "products"],
          assignedStores: ["store_1"],
          password: "billing123",
          createdAt: new Date().toISOString(),
        },
        {
          id: "manager_1",
          username: "manager",
          name: "Store Manager",
          email: "manager@siriartjewellery.com",
          phone: "+91 98765 43212",
          role: "billing_user",
          permissions: ["billing", "products", "reports"],
          assignedStores: ["store_1", "store_2"],
          password: "manager123",
          createdAt: new Date().toISOString(),
        },
        {
          id: "temp_1",
          username: "temp",
          name: "Temporary User",
          email: "temp@siriart.com",
          phone: "+91 98765 43213",
          role: "temporary_user",
          permissions: ["billing"],
          password: "temp123",
          createdAt: new Date().toISOString(),
          isTemporary: true,
        },
      ]

      localStorage.setItem("adminUsers", JSON.stringify(defaultUsers))

      // Initialize default stores
      const defaultStores = [
        {
          id: "store_1",
          name: "Main Store",
          address: "123 Jewellery Street, City",
          status: "active",
        },
        {
          id: "store_2",
          name: "Branch Store",
          address: "456 Market Road, City",
          status: "active",
        },
        {
          id: "store3",
          name: "SIRI ART JEWELLERY - Mall",
          address: "789 Mall Complex, City",
          status: "active",
        },
      ]
      localStorage.setItem("stores", JSON.stringify(defaultStores))
    } catch (error) {
      console.error("Error initializing default admin:", error)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")
    setSuccess("")

    try {
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Validate input
      if (!email || !password || !email.trim() || !password.trim()) {
        setError("Please enter both email and password")
        return
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        setError("Please enter a valid email address")
        return
      }

      // Get users from localStorage
      const usersData = localStorage.getItem("adminUsers")

      if (!usersData) {
        initializeDefaultAdmin()
      }

      const users: AdminUser[] = JSON.parse(localStorage.getItem("adminUsers") || "[]")

      // Find user by email
      const user = users.find((u) => {
        if (!u || !u.email || u.isTemporary) {
          return false
        }
        return u.email.toLowerCase() === email.toLowerCase()
      })

      if (!user) {
        setError("Invalid email or password")
        return
      }

      // Check password
      let isValidPassword = false

      if (user.password) {
        isValidPassword = user.password === password
      } else {
        // Fallback to default passwords based on role
        const defaultPasswords: Record<string, string> = {
          "admin@siriartjewellery.com": "admin123",
          "billing@siriartjewellery.com": "billing123",
          "manager@siriartjewellery.com": "manager123",
          "temp@siriart.com": "temp123",
        }
        isValidPassword = defaultPasswords[user.email.toLowerCase()] === password
      }

      if (!isValidPassword) {
        setError("Invalid email or password")
        return
      }

      // Update last login
      user.lastLogin = new Date().toISOString()
      const updatedUsers = users.map((u) => (u.id === user.id ? user : u))
      localStorage.setItem("adminUsers", JSON.stringify(updatedUsers))

      // Handle remember email
      if (rememberEmail) {
        localStorage.setItem("rememberedEmail", email)
      } else {
        localStorage.removeItem("rememberedEmail")
      }

      // Set login state
      localStorage.setItem("adminLoggedIn", "true")
      localStorage.setItem("adminUser", JSON.stringify(user))

      setSuccess("Login successful! Redirecting...")

      toast({
        title: "Login Successful",
        description: `Welcome back, ${user.name}!`,
      })

      // Redirect based on role
      setTimeout(() => {
        if (user.role === "super_admin") {
          router.push("/dashboard")
        } else {
          router.push("/billing")
        }
      }, 1000)
    } catch (error) {
      console.error("Login error:", error)
      setError("An error occurred during login. Please try again.")
      toast({
        title: "Login Error",
        description: "An error occurred during login. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetLoading(true)
    setResetError("")
    setResetSuccess("")

    try {
      await new Promise((resolve) => setTimeout(resolve, 1000))

      if (resetStep === 1) {
        // Verify email exists
        if (!resetEmail || !resetEmail.trim()) {
          setResetError("Please enter your email address")
          return
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(resetEmail)) {
          setResetError("Please enter a valid email address")
          return
        }

        const users: AdminUser[] = JSON.parse(localStorage.getItem("adminUsers") || "[]")
        const user = users.find((u) => {
          if (!u || !u.email) return false
          return u.email.toLowerCase() === resetEmail.toLowerCase()
        })

        if (!user) {
          setResetError("Email address not found in our system")
          return
        }

        setResetSuccess("Reset code sent to your email! Check your inbox.")
        setResetStep(2)
      } else if (resetStep === 2) {
        // Verify reset code
        if (!resetCode || resetCode !== "123456") {
          setResetError("Invalid reset code. Please check your email.")
          return
        }

        setResetSuccess("Code verified! Please set your new password.")
        setResetStep(3)
      } else if (resetStep === 3) {
        // Reset password
        if (!newPassword || !confirmPassword) {
          setResetError("Please fill in all password fields")
          return
        }

        if (newPassword !== confirmPassword) {
          setResetError("Passwords do not match")
          return
        }

        if (newPassword.length < 6) {
          setResetError("Password must be at least 6 characters long")
          return
        }

        // Update password in localStorage
        const users: AdminUser[] = JSON.parse(localStorage.getItem("adminUsers") || "[]")
        const userIndex = users.findIndex((u) => {
          if (!u || !u.email || !resetEmail) return false
          return u.email.toLowerCase() === resetEmail.toLowerCase()
        })

        if (userIndex !== -1) {
          users[userIndex].password = newPassword
          localStorage.setItem("adminUsers", JSON.stringify(users))
        }

        setResetSuccess("Password reset successful! You can now login with your new password.")

        toast({
          title: "Password Reset Successful",
          description: "You can now login with your new password.",
        })

        // Reset form and close dialog
        setTimeout(() => {
          setShowForgotPassword(false)
          setResetStep(1)
          setResetEmail("")
          setResetCode("")
          setNewPassword("")
          setConfirmPassword("")
          setResetError("")
          setResetSuccess("")
        }, 2000)
      }
    } catch (error) {
      console.error("Password reset error:", error)
      setResetError("An error occurred during password reset. Please try again.")
    } finally {
      setResetLoading(false)
    }
  }

  const resetForgotPasswordForm = () => {
    setResetStep(1)
    setResetEmail("")
    setResetCode("")
    setNewPassword("")
    setConfirmPassword("")
    setResetError("")
    setResetSuccess("")
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mb-4">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">SIRI ART JEWELLERY</h1>
          <p className="text-gray-600 mt-2">Admin Portal</p>
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader className="text-center pb-4">
            <CardTitle className="flex items-center">
              <Lock className="h-5 w-5 mr-2" />
              Sign In
            </CardTitle>
            <CardDescription>Enter your credentials to access the admin dashboard</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Main Login Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    disabled={isLoading}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="remember"
                    checked={rememberEmail}
                    onChange={(e) => setRememberEmail(e.target.checked)}
                    className="rounded"
                    disabled={isLoading}
                  />
                  <Label htmlFor="remember" className="text-sm">
                    Remember email
                  </Label>
                </div>

                <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="link"
                      className="text-sm text-blue-600 hover:text-blue-800 p-0"
                      onClick={resetForgotPasswordForm}
                    >
                      Forgot Password?
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="flex items-center">
                        <Lock className="h-5 w-5 mr-2 text-blue-600" />
                        Reset Password
                      </DialogTitle>
                      <DialogDescription>
                        {resetStep === 1 && "Enter your email address to receive a reset code"}
                        {resetStep === 2 && "Enter the verification code sent to your email"}
                        {resetStep === 3 && "Create your new password"}
                      </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleForgotPassword} className="space-y-4">
                      {resetStep === 1 && (
                        <div className="space-y-2">
                          <Label htmlFor="resetEmail">Email Address</Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                            <Input
                              id="resetEmail"
                              type="email"
                              placeholder="Enter your email address"
                              value={resetEmail}
                              onChange={(e) => setResetEmail(e.target.value)}
                              className="pl-10"
                              required
                              disabled={resetLoading}
                            />
                          </div>
                        </div>
                      )}

                      {resetStep === 2 && (
                        <div className="space-y-2">
                          <Label htmlFor="resetCode">Verification Code</Label>
                          <Input
                            id="resetCode"
                            type="text"
                            placeholder="Enter the 6-digit code"
                            value={resetCode}
                            onChange={(e) => setResetCode(e.target.value)}
                            required
                            disabled={resetLoading}
                            maxLength={6}
                          />
                          <p className="text-xs text-gray-500">
                            For demo purposes, use code: <strong>123456</strong>
                          </p>
                        </div>
                      )}

                      {resetStep === 3 && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="newPassword">New Password</Label>
                            <Input
                              id="newPassword"
                              type="password"
                              placeholder="Enter new password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              required
                              disabled={resetLoading}
                              minLength={6}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirm Password</Label>
                            <Input
                              id="confirmPassword"
                              type="password"
                              placeholder="Confirm new password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              required
                              disabled={resetLoading}
                              minLength={6}
                            />
                          </div>
                        </>
                      )}

                      {resetError && (
                        <Alert className="border-red-200 bg-red-50">
                          <AlertCircle className="h-4 w-4 text-red-600" />
                          <AlertDescription className="text-red-700">{resetError}</AlertDescription>
                        </Alert>
                      )}

                      {resetSuccess && (
                        <Alert className="border-green-200 bg-green-50">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <AlertDescription className="text-green-700">{resetSuccess}</AlertDescription>
                        </Alert>
                      )}

                      <div className="flex gap-2">
                        {resetStep > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setResetStep(resetStep - 1)}
                            disabled={resetLoading}
                            className="flex-1"
                          >
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back
                          </Button>
                        )}
                        <Button type="submit" disabled={resetLoading} className="flex-1">
                          {resetLoading
                            ? "Processing..."
                            : resetStep === 1
                              ? "Send Code"
                              : resetStep === 2
                                ? "Verify Code"
                                : "Reset Password"}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              {error && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-700">{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-700">{success}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>

            {/* Demo Credentials */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Demo Credentials:</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 bg-white rounded border">
                  <div className="flex items-center">
                    <Shield className="h-3 w-3 text-blue-600 mr-2" />
                    <span className="font-medium">Super Admin</span>
                  </div>
                  <div className="text-gray-600">admin@siriartjewellery.com / admin123</div>
                </div>
                <div className="flex items-center justify-between p-2 bg-white rounded border">
                  <div className="flex items-center">
                    <User className="h-3 w-3 text-green-600 mr-2" />
                    <span className="font-medium">Billing User</span>
                  </div>
                  <div className="text-gray-600">billing@siriartjewellery.com / billing123</div>
                </div>
                <div className="flex items-center justify-between p-2 bg-white rounded border">
                  <div className="flex items-center">
                    <Clock className="h-3 w-3 text-orange-600 mr-2" />
                    <span className="font-medium">Temporary User</span>
                  </div>
                  <div className="text-gray-600">temp@siriart.com / temp123</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-6 text-sm text-gray-600">
          <p>© 2024 SIRI ART JEWELLERY. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}
