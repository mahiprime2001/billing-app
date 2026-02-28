import { redirect } from "next/navigation"

export default function ReturnsRedirectPage() {
  redirect("/dashboard/damaged-products")
}

