"use client"

import DashboardLayout from "@/components/dashboard-layout"
import AttendanceEmployees from "@/components/attendance-employees"

export default function EmployeesPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 md:p-6">
        <div>
          <h1 className="text-xl font-semibold">Employees</h1>
          <p className="text-sm text-muted-foreground">
            Shop staff attendance — face check-ins from the shop phones. Employees are
            added and managed in siri-website.
          </p>
        </div>
        <AttendanceEmployees />
      </div>
    </DashboardLayout>
  )
}
