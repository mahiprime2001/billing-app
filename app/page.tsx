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

interface ForgotPasswordState {
  email: string
  loading: boolean
  error: string
  success: boolean
  message: string
}

export default function LoginPage() {
  console.log("LoginPage component rendered");
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // Login form state
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [rememberEmail, setRememberEmail] = useState(false)

  // Forgot password state (same as billing app)
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false)
  const [forgotPassword, setForgotPassword] = useState<ForgotPasswordState>({
    email: "",
    loading: false,
    error: "",
    success: false,
    message: ""
  })

  useEffect(() => {
    // Load remembered email
    const rememberedEmail = localStorage.getItem("rememberedAdminEmail")
    if (rememberedEmail) {
      setEmail(rememberedEmail)
      setRememberEmail(true)
    }
  }, []) // Removed router from dependency array as it's not directly used for re-evaluation here

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")
    setSuccess("")

    try {
      // Validate input
      if (!email || !password || !email.trim() || !password.trim()) {
        setError("Please enter both email and password")
        setIsLoading(false)
        return
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        setError("Please enter a valid email address")
        setIsLoading(false)
        return
      }

      // Use the Flask backend URL directly
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        setError(errorData.message || "Invalid email or password")
        setIsLoading(false)
        return
      }

      const { user: userData, auth_ok, user_role } = await response.json()
      console.log("handleLogin - User data from API:", userData);
      console.log("handleLogin - Auth status:", auth_ok, "User role:", user_role);

      if (!auth_ok) {
        setError("Authentication failed. Please try again.")
        setIsLoading(false)
        return
      }

      // Handle remember email
      if (rememberEmail) {
        localStorage.setItem("rememberedAdminEmail", email)
      } else {
        localStorage.removeItem("rememberedAdminEmail")
      }

      // Store user data and role directly (no adminLoggedIn flag needed for now)
      localStorage.setItem("adminUser", JSON.stringify({ ...userData, role: user_role }))

      setSuccess("Login successful! Redirecting...")

      toast({
        title: "Login Successful",
        description: `Welcome back, ${userData.name}!`,
      })

      // Redirect based on role
      setTimeout(() => {
        if (user_role === "super_admin") {
          console.log("handleLogin - Redirecting to /dashboard");
          router.push("/dashboard")
        } else {
          console.log("handleLogin - Redirecting to /billing");
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

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  // Same forgot password logic as billing app
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!forgotPassword.email) {
      setForgotPassword(prev => ({ 
        ...prev, 
        error: "Email is required" 
      }))
      return
    }

    if (!validateEmail(forgotPassword.email)) {
      setForgotPassword(prev => ({ 
        ...prev, 
        error: "Please enter a valid email address" 
      }))
      return
    }

    setForgotPassword(prev => ({ 
      ...prev, 
      loading: true, 
      error: "", 
      message: "" 
    }))

    try {
      // Use the Flask backend URL directly for forgot password
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/auth/forgot-password-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: forgotPassword.email }),
      })

      const data = await response.json()

      if (data.success) {
        setForgotPassword(prev => ({
          ...prev,
          success: true,
          message: data.message,
          email: "" // Clear email for security
        }))

        toast({
          title: "📧 Reset Link Sent",
          description: "Check your email for password reset instructions.",
        })
      } else {
        setForgotPassword(prev => ({ 
          ...prev, 
          error: data.message 
        }))
        
        toast({
          title: "❌ Request Failed",
          description: data.message,
          variant: "destructive",
        })
      }
    } catch (error) {
      setForgotPassword(prev => ({ 
        ...prev, 
        error: "Network error. Please check your connection and try again." 
      }))
      
      toast({
        title: "⚠️ Connection Error",
        description: "Please check your internet connection.",
        variant: "destructive",
      })
    } finally {
      setForgotPassword(prev => ({ 
        ...prev, 
        loading: false 
      }))
    }
  }

  const resetForgotPasswordForm = () => {
    setForgotPassword({
      email: "",
      loading: false,
      error: "",
      success: false,
      message: ""
    })
  }

  const handleForgotPasswordModalChange = (open: boolean) => {
    setForgotPasswordOpen(open)
    if (!open) {
      // Reset form when modal closes
      setTimeout(() => {
        resetForgotPasswordForm()
      }, 200) // Small delay to allow modal animation
    }
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
            <CardTitle className="flex items-center justify-center">
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
                <div className="flex justify-between items-center">
                  <Label htmlFor="password">Password</Label>
                  <Dialog open={forgotPasswordOpen} onOpenChange={handleForgotPasswordModalChange}>
                    <DialogTrigger asChild>
                      <Button 
                        variant="link" 
                        className="p-0 h-auto text-sm text-blue-600 hover:text-blue-800"
                      >
                        Forgot Password?
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <Mail className="h-5 w-5 text-blue-600" />
                          Reset Password
                        </DialogTitle>
                        <DialogDescription>
                          {forgotPassword.success 
                            ? "Check your email for reset instructions"
                            : "Enter your email address to receive a password reset link"
                          }
                        </DialogDescription>
                      </DialogHeader>

                      {forgotPassword.success ? (
                        // Success State (same as billing app)
                        <div className="space-y-4">
                          <div className="flex items-center justify-center p-6">
                            <div className="text-center space-y-3">
                              <div className="mx-auto flex items-center justify-center w-12 h-12 bg-green-100 rounded-full">
                                <CheckCircle className="w-6 h-6 text-green-600" />
                              </div>
                              <div>
                                <h3 className="text-lg font-medium text-gray-900">Email Sent!</h3>
                                <p className="text-sm text-gray-600 mt-1">
                                  {forgotPassword.message}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={resetForgotPasswordForm}
                              className="flex-1"
                            >
                              <ArrowLeft className="w-4 h-4 mr-2" />
                              Send Another
                            </Button>
                            <Button
                              type="button"
                              onClick={() => setForgotPasswordOpen(false)}
                              className="flex-1"
                            >
                              Close
                            </Button>
                          </div>
                        </div>
                      ) : (
                        // Form State (same as billing app)
                        <form onSubmit={handleForgotPassword} className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="forgot-email">Email Address</Label>
                            <Input
                              id="forgot-email"
                              type="email"
                              value={forgotPassword.email}
                              onChange={(e) => setForgotPassword(prev => ({ 
                                ...prev, 
                                email: e.target.value, 
                                error: "" 
                              }))}
                              placeholder="Enter your email address"
                              disabled={forgotPassword.loading}
                              className="w-full"
                            />
                          </div>

                          {forgotPassword.error && (
                            <Alert variant="destructive">
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription>{forgotPassword.error}</AlertDescription>
                            </Alert>
                          )}

                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setForgotPasswordOpen(false)}
                              disabled={forgotPassword.loading}
                              className="flex-1"
                            >
                              Cancel
                            </Button>
                            <Button
                              type="submit"
                              disabled={forgotPassword.loading || !forgotPassword.email}
                              className="flex-1"
                            >
                              {forgotPassword.loading ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                  Sending...
                                </>
                              ) : (
                                <>
                                  <Mail className="w-4 h-4 mr-2" />
                                  Send Link
                                </>
                              )}
                            </Button>
                          </div>
                        </form>
                      )}
                    </DialogContent>
                  </Dialog>
                </div>
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

                <Dialog open={forgotPasswordOpen} onOpenChange={handleForgotPasswordModalChange}>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="link"
                      className="text-sm text-blue-600 hover:text-blue-800 p-0"
                      onClick={resetForgotPasswordForm}
                    >
                      Reset your password
                    </Button>
                  </DialogTrigger>
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

            
          </CardContent>
        </Card>

        <div className="text-center mt-6 text-sm text-gray-600">
          <p>© 2024 SIRI ART JEWELLERY. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}
