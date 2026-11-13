"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { API_BASE } from "@/lib/api-base"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  IndianRupee,
  Loader2,
  PauseCircle,
  Pencil,
  Percent,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  STATUS_LABEL,
  buildPayload,
  describeDiscount,
  describeScope,
  describeValidity,
  discountedPrice,
  emptyForm,
  formFromRule,
  namesPreview,
  validateForm,
  type DiscountRule,
  type RuleForm,
  type RuleStatus,
} from "@/lib/discount-rules"

interface ProductOption {
  id: string
  name: string
  barcode: string
  price: number
}

interface StoreOption {
  id: string
  name: string
  code: string
  active: boolean
}

const PICKER_LIMIT = 50 // rows shown at once in the product picker (search narrows it down)
const SELECT_ALL_LIMIT = 500 // "select all matches" only for a reasonably small match list

const STATUS_STYLE: Record<RuleStatus, string> = {
  active: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  scheduled: "bg-sky-100 text-sky-800 hover:bg-sky-100",
  paused: "bg-slate-200 text-slate-700 hover:bg-slate-200",
  expired: "bg-amber-100 text-amber-800 hover:bg-amber-100",
}

const toList = (data: any): any[] => (Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [])

function adminName(): string | undefined {
  try {
    const raw = window.localStorage.getItem("adminUser")
    if (!raw) return undefined
    const u = JSON.parse(raw)
    return u?.name || u?.email || undefined
  } catch {
    return undefined
  }
}

async function readError(res: Response): Promise<{ message: string; tableMissing: boolean }> {
  try {
    const body = await res.json()
    return { message: body?.error || `Request failed (${res.status})`, tableMissing: body?.code === "table_missing" }
  } catch {
    return { message: `Request failed (${res.status})`, tableMissing: false }
  }
}

export default function DiscountRules() {
  const [rules, setRules] = useState<DiscountRule[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [stores, setStores] = useState<StoreOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tableMissing, setTableMissing] = useState(false)

  const [statusFilter, setStatusFilter] = useState<"all" | RuleStatus>("all")
  const [storeFilter, setStoreFilter] = useState("all")
  const [search, setSearch] = useState("")

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<DiscountRule | null>(null)
  const [form, setForm] = useState<RuleForm>(emptyForm())
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [productSearch, setProductSearch] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rulesRes, productsRes, storesRes] = await Promise.all([
        fetch(`${API_BASE}/api/discount-rules?t=${Date.now()}`, { cache: "no-store" }),
        fetch(`${API_BASE}/api/products`),
        fetch(`${API_BASE}/api/stores`),
      ])
      if (!rulesRes.ok) {
        const failure = await readError(rulesRes)
        setTableMissing(failure.tableMissing)
        throw new Error(failure.message)
      }
      setTableMissing(false)
      setRules(toList(await rulesRes.json()) as DiscountRule[])

      if (productsRes.ok) {
        setProducts(
          toList(await productsRes.json())
            .map((p: any) => ({
              id: String(p.id ?? ""),
              name: String(p.name ?? "Unnamed product"),
              barcode: String(p.barcodes ?? p.barcode ?? "").split(",")[0].trim(),
              price: Number(p.sellingPrice ?? p.selling_price ?? p.price ?? 0) || 0,
            }))
            .filter((p) => p.id)
            .sort((a, b) => a.name.localeCompare(b.name)),
        )
      }
      if (storesRes.ok) {
        setStores(
          toList(await storesRes.json())
            .map((s: any) => ({
              id: String(s.id ?? ""),
              name: String(s.name ?? "Store"),
              code: String(s.storecode ?? ""),
              active: (s.status ?? "active") === "active",
            }))
            .filter((s) => s.id)
            .sort((a, b) => a.name.localeCompare(b.name)),
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load discount rules")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const productNameById = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products])
  const storeNameById = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores])

  const counts = useMemo(() => {
    const c: Record<RuleStatus, number> = { active: 0, scheduled: 0, paused: 0, expired: 0 }
    for (const r of rules) c[r.status] = (c[r.status] ?? 0) + 1
    return c
  }, [rules])

  const visibleRules = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rules.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false
      if (storeFilter !== "all" && r.storeIds && r.storeIds.length > 0 && !r.storeIds.includes(storeFilter)) return false
      if (q && !r.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [rules, statusFilter, storeFilter, search])

  // ---- dialog ----

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormError(null)
    setProductSearch("")
    setDialogOpen(true)
  }

  const openEdit = (rule: DiscountRule) => {
    setEditing(rule)
    setForm(formFromRule(rule))
    setFormError(null)
    setProductSearch("")
    setDialogOpen(true)
  }

  const patch = (changes: Partial<RuleForm>) => setForm((prev) => ({ ...prev, ...changes }))

  const toggleId = (field: "productIds" | "storeIds", id: string) =>
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(id) ? prev[field].filter((x) => x !== id) : [...prev[field], id],
    }))

  const matches = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q))
  }, [products, productSearch])

  const save = async () => {
    const problem = validateForm(form)
    if (problem) {
      setFormError(problem)
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch(editing ? `${API_BASE}/api/discount-rules/${editing.id}` : `${API_BASE}/api/discount-rules`, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(form, editing ? undefined : adminName())),
      })
      if (!res.ok) {
        setFormError((await readError(res)).message)
        return
      }
      setDialogOpen(false)
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't save the discount")
    } finally {
      setSaving(false)
    }
  }

  const setActive = async (rule: DiscountRule, active: boolean) => {
    setBusyId(rule.id)
    try {
      const res = await fetch(`${API_BASE}/api/discount-rules/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      })
      if (!res.ok) throw new Error((await readError(res)).message)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change the discount")
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (rule: DiscountRule) => {
    if (!window.confirm(`Delete "${rule.name}"? Stores stop applying it right away.`)) return
    setBusyId(rule.id)
    try {
      const res = await fetch(`${API_BASE}/api/discount-rules/${rule.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await readError(res)).message)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the discount")
    } finally {
      setBusyId(null)
    }
  }

  // ---- preview line in the dialog ----
  const previewProduct = form.allProducts ? undefined : productById.get(form.productIds[0] ?? "")
  const previewValue = Number(form.value)
  const validValue = Number.isFinite(previewValue) && previewValue > 0
  const showPriceExample = !!previewProduct && previewProduct.price > 0 && validValue

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            {error}
            {tableMissing && (
              <p className="mt-1 text-xs text-red-600">
                The database table for discounts hasn&apos;t been created yet. Run{" "}
                <code className="rounded bg-red-100 px-1">siri-api/migrations/discount_rules.sql</code> in the Supabase SQL
                editor once, then refresh.
              </p>
            )}
          </div>
        </div>
      )}

      {/* summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard icon={CheckCircle2} label="Active now" value={counts.active} tone="text-emerald-600" />
        <SummaryCard icon={CalendarClock} label="Scheduled" value={counts.scheduled} tone="text-sky-600" />
        <SummaryCard icon={PauseCircle} label="Paused" value={counts.paused} tone="text-slate-500" />
        <SummaryCard icon={Tag} label="Expired" value={counts.expired} tone="text-amber-600" />
      </div>

      <Card>
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Tag className="h-5 w-5 text-indigo-600" />
              Discount rules
              <Badge variant="secondary">{rules.length}</Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => void load()} aria-label="Refresh" title="Refresh">
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
              <Button onClick={openCreate} disabled={tableMissing}>
                <Plus className="mr-1.5 h-4 w-4" /> New discount
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border bg-white p-0.5">
              {(["all", "active", "scheduled", "paused", "expired"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                    statusFilter === s ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stores</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name…" className="h-9 w-56 pl-9" />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading && rules.length === 0 ? (
            <div className="flex items-center justify-center py-14 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading discounts…
            </div>
          ) : visibleRules.length === 0 ? (
            <div className="py-14 text-center text-sm text-muted-foreground">
              {rules.length === 0 ? (
                <>
                  <Tag className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                  <p>No discount rules yet.</p>
                  <p className="mt-1">Create one to give some products a price cut in some (or all) stores.</p>
                </>
              ) : (
                "No discounts match these filters."
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Discount</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead>Stores</TableHead>
                    <TableHead>Valid</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[1%] whitespace-nowrap text-right">On / off</TableHead>
                    <TableHead className="w-[1%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRules.map((rule) => (
                    <TableRow key={rule.id} className={cn(rule.status !== "active" && "text-muted-foreground")}>
                      <TableCell>
                        <div className="font-medium text-foreground">{rule.name}</div>
                        <div className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-emerald-700">
                          {rule.discountType === "percent" ? <Percent className="h-3.5 w-3.5" /> : <IndianRupee className="h-3.5 w-3.5" />}
                          {describeDiscount(rule.discountType, rule.value)}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[240px] text-sm">
                        {!rule.productIds || rule.productIds.length === 0 ? (
                          "All products"
                        ) : (
                          <span title={rule.productIds.map((id) => productNameById.get(id) ?? id).join(", ")}>
                            <span className="font-medium text-foreground">{rule.productIds.length}</span>{" "}
                            {namesPreview(rule.productIds, productNameById)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] text-sm">
                        {!rule.storeIds || rule.storeIds.length === 0 ? (
                          "All stores"
                        ) : (
                          <span title={rule.storeIds.map((id) => storeNameById.get(id) ?? id).join(", ")}>
                            {namesPreview(rule.storeIds, storeNameById, 3)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{describeValidity(rule.startsAt, rule.endsAt)}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_STYLE[rule.status]}>{STATUS_LABEL[rule.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={rule.active}
                          disabled={busyId === rule.id}
                          onCheckedChange={(v) => void setActive(rule, v)}
                          aria-label={rule.active ? `Pause ${rule.name}` : `Turn on ${rule.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(rule)} aria-label={`Edit ${rule.name}`} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={busyId === rule.id}
                            onClick={() => void remove(rule)}
                            aria-label={`Delete ${rule.name}`}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            If more than one active discount covers the same product in a store, the store should use whichever gives the customer
            the bigger saving.
          </p>
        </CardContent>
      </Card>

      {/* create / edit */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !saving && setDialogOpen(open)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit discount" : "New discount"}</DialogTitle>
            <DialogDescription>
              Choose what is discounted, where, and for how long. Stores pick it up automatically — no approval needed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="e.g. Diwali soap offer" maxLength={120} />
            </Field>

            <Field label="Discount">
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg border bg-white p-0.5">
                  {(
                    [
                      ["percent", "% off"],
                      ["amount", "₹ off each"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => patch({ discountType: value })}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                        form.discountType === value ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <Input
                  type="number"
                  min={0}
                  max={form.discountType === "percent" ? 100 : undefined}
                  step="any"
                  inputMode="decimal"
                  value={form.value}
                  onChange={(e) => patch({ value: e.target.value })}
                  placeholder={form.discountType === "percent" ? "10" : "50"}
                  className="w-32"
                />
              </div>
            </Field>

            <Field label="Products">
              <Scope
                allLabel="All products"
                pickLabel="Selected products"
                all={form.allProducts}
                onChange={(all) => patch({ allProducts: all })}
              />
              {!form.allProducts && (
                <div className="mt-3 space-y-2 rounded-md border p-3">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder={`Search ${products.length.toLocaleString()} products by name or barcode…`}
                      className="pl-9"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      <strong className="text-foreground">{form.productIds.length}</strong> selected
                      {productSearch.trim() && ` · ${matches.length.toLocaleString()} match`}
                    </span>
                    <span className="flex gap-2">
                      {productSearch.trim() && matches.length > 0 && matches.length <= SELECT_ALL_LIMIT && (
                        <button
                          type="button"
                          className="font-medium text-indigo-600 hover:underline"
                          onClick={() => patch({ productIds: Array.from(new Set([...form.productIds, ...matches.map((m) => m.id)])) })}
                        >
                          Select all {matches.length} matches
                        </button>
                      )}
                      {form.productIds.length > 0 && (
                        <button type="button" className="font-medium text-red-600 hover:underline" onClick={() => patch({ productIds: [] })}>
                          Clear
                        </button>
                      )}
                    </span>
                  </div>

                  {form.productIds.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {form.productIds.slice(0, 8).map((id) => (
                        <Badge key={id} variant="secondary" className="gap-1 pr-1 font-normal">
                          <span className="max-w-[160px] truncate">{productNameById.get(id) ?? "Removed product"}</span>
                          <button type="button" onClick={() => toggleId("productIds", id)} aria-label="Remove" className="rounded-full hover:bg-slate-300">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                      {form.productIds.length > 8 && <Badge variant="outline">+{form.productIds.length - 8} more</Badge>}
                    </div>
                  )}

                  <div className="max-h-56 divide-y overflow-y-auto rounded border">
                    {matches.slice(0, PICKER_LIMIT).map((p) => (
                      <label key={p.id} className="flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm hover:bg-muted/50">
                        <Checkbox checked={form.productIds.includes(p.id)} onCheckedChange={() => toggleId("productIds", p.id)} />
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{p.barcode || "—"}</span>
                        <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">₹{p.price}</span>
                      </label>
                    ))}
                    {matches.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">No products found.</div>}
                    {matches.length > PICKER_LIMIT && (
                      <div className="bg-muted/30 p-2 text-center text-xs text-muted-foreground">
                        Showing {PICKER_LIMIT} of {matches.length.toLocaleString()} — search to narrow it down.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Field>

            <Field label="Stores">
              <Scope allLabel="All stores" pickLabel="Selected stores" all={form.allStores} onChange={(all) => patch({ allStores: all })} />
              {!form.allStores && (
                <div className="mt-3 max-h-48 divide-y overflow-y-auto rounded-md border">
                  {stores.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm hover:bg-muted/50">
                      <Checkbox checked={form.storeIds.includes(s.id)} onCheckedChange={() => toggleId("storeIds", s.id)} />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      {s.code && <span className="font-mono text-xs text-muted-foreground">{s.code}</span>}
                      {!s.active && <Badge variant="outline">inactive</Badge>}
                    </label>
                  ))}
                  {stores.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">No stores found.</div>}
                </div>
              )}
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Starts (optional)">
                <Input type="date" value={form.startDate} max={form.endDate || undefined} onChange={(e) => patch({ startDate: e.target.value })} />
              </Field>
              <Field label="Ends (optional)">
                <Input type="date" value={form.endDate} min={form.startDate || undefined} onChange={(e) => patch({ endDate: e.target.value })} />
              </Field>
            </div>
            <p className="-mt-3 text-xs text-muted-foreground">Leave the dates empty for no limit. The end date is included.</p>

            <label className="flex items-center justify-between rounded-md border p-3">
              <span>
                <span className="block text-sm font-medium">Turned on</span>
                <span className="block text-xs text-muted-foreground">Switch off to keep the discount saved but not applied.</span>
              </span>
              <Switch checked={form.active} onCheckedChange={(v) => patch({ active: v })} />
            </label>

            <div className="rounded-md bg-indigo-50 p-3 text-sm text-indigo-900">
              <span className="font-semibold">{validValue ? describeDiscount(form.discountType, previewValue) : "Discount"}</span> on{" "}
              {describeScope(form.allProducts ? null : form.productIds, form.allStores ? null : form.storeIds).replace(" · ", ", in ")} ·{" "}
              {describeValidity(form.startDate ? `${form.startDate}T00:00:00` : null, form.endDate ? `${form.endDate}T00:00:00` : null)}
              {showPriceExample && previewProduct && (
                <div className="mt-1 text-xs">
                  e.g. {previewProduct.name}: ₹{previewProduct.price} → ₹{discountedPrice(previewProduct.price, form.discountType, previewValue)}
                </div>
              )}
            </div>

            {formError && (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" /> {formError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Create discount"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  tone: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Icon className={cn("h-3.5 w-3.5", tone)} />
          {label}
        </div>
        <p className={cn("mt-1 text-2xl font-bold tabular-nums", tone)}>{value}</p>
      </CardContent>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium">{label}</div>
      {children}
    </div>
  )
}

function Scope({
  allLabel,
  pickLabel,
  all,
  onChange,
}: {
  allLabel: string
  pickLabel: string
  all: boolean
  onChange: (all: boolean) => void
}) {
  return (
    <div className="inline-flex rounded-lg border bg-white p-0.5">
      {(
        [
          [true, allLabel],
          [false, pickLabel],
        ] as const
      ).map(([value, label]) => (
        <button
          key={label}
          type="button"
          onClick={() => onChange(value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            all === value ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
