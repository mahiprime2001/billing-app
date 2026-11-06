import { API_BASE } from "@/lib/api-base"
import type { AuditItem } from "@/lib/audit"

// Shared audit sessions -- several devices counting the same store at once.
//
// Every device keeps its own local copy of the count (lib/audit.ts drafts) and also
// sends each scan to siri-api as a small append-only "event". siri-api keeps these in
// its own SQLite file (NOT Supabase, no inventory touched) and hands other devices'
// events back, so everyone's screen converges on the same totals. Only "Done" writes
// the final audit to Supabase, and only one device can do that.
//
// Offline: events wait in a local outbox and are sent when the connection returns.

const API = API_BASE
const POLL_MS = 3000
const BATCH = 200

// ============================================================
// TYPES
// ============================================================

// Panel item: an audit line plus "not in the system" (newly found) flag.
export interface CountItem extends AuditItem {
  unexpected: boolean
}

export interface PanelState {
  left: CountItem[]
  right: CountItem[]
}

// What another device needs to draw an item it has never seen (a newly found product).
export interface ItemMeta {
  name?: string
  barcode?: string
  barcodes?: string[]
  price?: number
}

export interface SessionEvent {
  id: string
  type: "delta" | "reset"
  key: string
  delta: number
  meta?: ItemMeta | null
  ts: string
}

export interface RemoteEvent extends SessionEvent {
  seq: number
  deviceId: string
  deviceLabel?: string | null
}

export interface SessionDevice {
  deviceId: string
  label?: string | null
  lastSeen: string
}

export interface SessionSummary {
  id: string
  storeId: string
  status: string
  startedBy?: string | null
  startedAt: string
  auditId?: string | null
  devices: SessionDevice[]
  scannedUnits: number
  countedLines: number
  // "Pause billing at this store while this audit runs" -- the store's billing app asks siri-api
  // about this every ~30 s and blocks new bills while it is true. Ends with the audit.
  billingPaused?: boolean
  billingPausedBy?: string | null
  billingPausedAt?: string | null
}

// One row of GET /api/audit-sessions/open: a store with a live audit.
export interface OpenSession {
  sessionId: string
  storeId: string
  startedBy?: string | null
  startedAt: string
  billingPaused: boolean
  billingPausedBy?: string | null
  billingPausedAt?: string | null
}

export interface SessionEnd {
  status: string // "completed" | "cancelled" | ...
  auditId?: string | null
}

export interface SyncStatus {
  online: boolean
  pending: number
  devices: SessionDevice[]
  sessionId: string | null
}

// ============================================================
// SMALL HELPERS
// ============================================================

const isBrowser = () => typeof window !== "undefined"

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/** Stable id for this browser/computer, so the server can tell devices apart. */
export function getDeviceId(): string {
  if (!isBrowser()) return "server"
  try {
    let id = window.localStorage.getItem("audit-device-id")
    if (!id) {
      id = newId()
      window.localStorage.setItem("audit-device-id", id)
    }
    // Two tabs of one browser share localStorage; without a per-tab part each would ignore the
    // other's scans as "its own". sessionStorage survives a reload but is private to the tab.
    let tab = window.sessionStorage.getItem("audit-tab-id")
    if (!tab) {
      tab = newId().slice(0, 6)
      window.sessionStorage.setItem("audit-tab-id", tab)
    }
    return `${id}:${tab}`
  } catch {
    return "device-unknown"
  }
}

interface ApiResult<T = any> {
  ok: boolean
  status: number // 0 = network failure
  data: T | null
}

async function call<T = any>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    })
    let data: any = null
    try {
      data = await res.json()
    } catch {
      /* empty body */
    }
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ============================================================
// SERVER CALLS
// ============================================================

/** The store's open session, `null` if none, `undefined` if we couldn't reach the server. */
export async function getOpenSession(storeId: string): Promise<SessionSummary | null | undefined> {
  const r = await call<{ session: SessionSummary | null }>(
    `/api/stores/${encodeURIComponent(storeId)}/audit-session`,
  )
  if (!r.ok) return undefined
  return r.data?.session ?? null
}

/** Every store that has a live audit right now (`undefined` if the server couldn't be reached). */
export async function listOpenSessions(): Promise<OpenSession[] | undefined> {
  const r = await call<{ sessions: OpenSession[] }>("/api/audit-sessions/open")
  if (!r.ok) return undefined
  return Array.isArray(r.data?.sessions) ? r.data!.sessions : []
}

/**
 * Turn "pause billing at this store" on or off for a live audit (admins only on the server).
 * Returns the updated session, or an `error` message to show.
 */
export async function setBillingPause(
  sessionId: string,
  paused: boolean,
): Promise<{ session?: SessionSummary; error?: string }> {
  const r = await call<{ session?: SessionSummary; error?: string }>(
    `/api/audit-sessions/${encodeURIComponent(sessionId)}/billing-pause`,
    { method: "PUT", body: JSON.stringify({ paused }) },
  )
  if (r.ok && r.data?.session) return { session: r.data.session }
  if (r.status === 0) return { error: "Couldn't reach the server. Nothing was changed." }
  if (r.status === 403) return { error: "Only an admin can pause or resume billing." }
  if (r.status === 409) return { error: "This audit has already ended, so there is nothing to change." }
  return { error: r.data?.error || `Couldn't change it (${r.status}).` }
}

/** Discard the session for every device. */
export async function cancelSession(sessionId: string): Promise<boolean> {
  const r = await call(`/api/audit-sessions/${encodeURIComponent(sessionId)}/cancel`, { method: "POST" })
  return r.ok || r.status === 409 // already over is fine
}

// ============================================================
// APPLYING EVENTS TO THE PANELS (pure)
// ============================================================

/** Add `delta` units to the item with this key, moving it between panels as needed. */
export function applyCountDelta(
  state: PanelState,
  key: string,
  delta: number,
  meta?: ItemMeta | null,
): PanelState {
  let { left, right } = state
  let item: CountItem | undefined

  const rIdx = right.findIndex((it) => it.productId === key)
  const lIdx = left.findIndex((it) => it.productId === key)
  if (rIdx !== -1) {
    item = right[rIdx]
    right = right.filter((_, i) => i !== rIdx)
  } else if (lIdx !== -1) {
    item = left[lIdx]
    left = left.filter((_, i) => i !== lIdx)
  } else if (delta > 0) {
    // Newly found product this device hasn't seen yet.
    const barcode = meta?.barcode ?? key
    item = {
      productId: key,
      name: meta?.name ?? "Unknown product",
      barcode,
      barcodes: meta?.barcodes?.length ? meta.barcodes : [barcode],
      price: Number(meta?.price ?? 0) || 0,
      systemQty: 0,
      countedQty: 0,
      outcome: "found",
      unexpected: true,
    }
  } else {
    return state
  }

  const count = Math.max(0, item.countedQty + delta)
  const next: CountItem = { ...item, countedQty: count }
  if (!next.unexpected && count >= next.systemQty) {
    right = [next, ...right]
  } else if (next.unexpected && count === 0) {
    // a newly found item counted back down to nothing disappears
  } else {
    left = [next, ...left]
  }
  return { left, right }
}

/** Everything back to zero; newly found items removed (same as the Reset button). */
export function applyReset(state: PanelState): PanelState {
  return {
    left: [...state.right, ...state.left]
      .filter((it) => !it.unexpected)
      .map((it) => ({ ...it, countedQty: 0 })),
    right: [],
  }
}

/** Apply events from other devices (or all events, when rebuilding) onto the panels. */
export function applyRemoteEvents(state: PanelState, events: RemoteEvent[]): PanelState {
  let s = state
  for (const e of events) {
    s = e.type === "reset" ? applyReset(s) : applyCountDelta(s, e.key, e.delta, e.meta)
  }
  return s
}

// ============================================================
// OUTBOX (events not yet confirmed by the server) -- survives refresh/crash
// ============================================================

interface StoredOutbox {
  sessionId: string | null
  events: SessionEvent[]
}

const outboxKey = (storeId: string) => `audit-outbox:${storeId}`

function loadOutbox(storeId: string): StoredOutbox {
  if (!isBrowser()) return { sessionId: null, events: [] }
  try {
    const raw = window.localStorage.getItem(outboxKey(storeId))
    if (!raw) return { sessionId: null, events: [] }
    const parsed = JSON.parse(raw)
    return {
      sessionId: parsed?.sessionId ?? null,
      events: Array.isArray(parsed?.events) ? parsed.events : [],
    }
  } catch {
    return { sessionId: null, events: [] }
  }
}

function saveOutbox(storeId: string, box: StoredOutbox): void {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(outboxKey(storeId), JSON.stringify(box))
  } catch {
    /* storage full / unavailable -- the live copy in memory still works */
  }
}

export function clearOutbox(storeId: string): void {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(outboxKey(storeId))
  } catch {
    /* non-fatal */
  }
}

// ============================================================
// SYNC ENGINE
// ============================================================

export interface SyncOptions {
  storeId: string
  deviceId: string
  label: string
  startedBy: string
  /** Start this audit with billing paused at the store. Only a NEW session takes it; joining never changes it. */
  pauseBilling?: boolean
  /** Session id saved in this device's draft (resume), if any. */
  draftSessionId?: string | null
  /** Highest server event already applied to the draft. */
  draftLastSeq?: number
  /** True when the panels start blank, so the server's whole history (including ours) is replayed. */
  replayAll: boolean
  /** Events from other devices to apply to the panels. `lastSeq` is the new high-water mark. */
  onRemote: (events: RemoteEvent[], lastSeq: number) => void
  /** The draft belonged to a session that no longer exists: reset the panels to blank. */
  onRebase: () => void
  /** The session was finished or cancelled (maybe by another device). */
  onEnded: (end: SessionEnd) => void
  onStatus: (status: SyncStatus) => void
}

export class AuditSync {
  sessionId: string | null = null
  lastSeq = 0

  private o: SyncOptions
  private outbox: SessionEvent[]
  private outboxSession: string | null
  private replayAll: boolean
  // Ids of scans made on this device during this visit. Their effect is already on
  // screen, so they must never be applied again when the server echoes them back.
  private emitted = new Set<string>()
  private devices: SessionDevice[] = []
  private online = true
  private busy = false
  private stopped = false
  private timer: ReturnType<typeof setInterval> | null = null
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private onNetworkBack = () => void this.tick()

  constructor(options: SyncOptions) {
    this.o = options
    this.replayAll = options.replayAll
    this.lastSeq = options.draftLastSeq ?? 0
    const stored = loadOutbox(options.storeId)
    this.outbox = stored.events
    this.outboxSession = stored.sessionId
  }

  start(): void {
    void this.tick()
    this.timer = setInterval(() => void this.tick(), POLL_MS)
    if (isBrowser()) window.addEventListener("online", this.onNetworkBack)
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.timer = null
    this.flushTimer = null
    if (isBrowser()) window.removeEventListener("online", this.onNetworkBack)
  }

  /** Record a scan/adjustment. Saved locally at once, sent to the server in the background. */
  emit(event: { type: "delta"; key: string; delta: number; meta?: ItemMeta | null } | { type: "reset" }): void {
    if (this.stopped) return
    const full: SessionEvent = {
      id: newId(),
      type: event.type,
      key: event.type === "delta" ? event.key : "",
      delta: event.type === "delta" ? event.delta : 0,
      meta: event.type === "delta" ? event.meta ?? null : null,
      ts: new Date().toISOString(),
    }
    this.emitted.add(full.id)
    this.outbox.push(full)
    this.persistOutbox()
    this.publish()
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = setTimeout(() => void this.tick(), 300)
  }

  /** Send everything pending and fetch what others did. Call before reading the final totals. */
  async syncNow(): Promise<boolean> {
    for (let i = 0; i < 50 && this.busy; i++) await sleep(100)
    await this.tick()
    return this.online && this.outbox.length === 0
  }

  // ---- internals ----

  private persistOutbox(): void {
    saveOutbox(this.o.storeId, { sessionId: this.sessionId ?? this.outboxSession, events: this.outbox })
  }

  private publish(): void {
    this.o.onStatus({
      online: this.online,
      pending: this.outbox.length,
      devices: this.devices,
      sessionId: this.sessionId,
    })
  }

  private async tick(): Promise<void> {
    if (this.busy || this.stopped) return
    this.busy = true
    try {
      if (!this.sessionId && !(await this.ensureSession())) return
      if (this.stopped) return
      if (!(await this.flush())) return
      await this.pull()
    } finally {
      this.busy = false
      if (!this.stopped) this.publish()
    }
  }

  private async ensureSession(): Promise<boolean> {
    const r = await call<{ session: SessionSummary }>(
      `/api/stores/${encodeURIComponent(this.o.storeId)}/audit-session`,
      {
        method: "POST",
        body: JSON.stringify({
          deviceId: this.o.deviceId,
          deviceLabel: this.o.label,
          startedBy: this.o.startedBy,
          pauseBilling: this.o.pauseBilling === true,
        }),
      },
    )
    if (!r.ok || !r.data?.session) {
      this.online = r.status !== 0
      return false
    }
    this.online = true
    const sid = r.data.session.id
    this.sessionId = sid

    const draftSid = this.o.draftSessionId
    if (draftSid && draftSid !== sid) {
      // Our saved draft was for a session that is over -- start blank on the live one.
      this.o.onRebase()
      this.lastSeq = 0
      this.replayAll = true
      this.outbox = []
    } else if (draftSid === sid) {
      this.replayAll = false // the draft already contains our own scans
    }
    // Events counted while offline belong to whatever session we ended up in,
    // unless they were recorded against a different (finished) one.
    if (this.outboxSession && this.outboxSession !== sid) this.outbox = []
    this.outboxSession = sid
    this.persistOutbox()
    return true
  }

  /** Returns false if sending failed (offline) or the session ended. */
  private async flush(): Promise<boolean> {
    while (this.outbox.length > 0 && this.sessionId) {
      const batch = this.outbox.slice(0, BATCH)
      const r = await call(`/api/audit-sessions/${encodeURIComponent(this.sessionId)}/events`, {
        method: "POST",
        body: JSON.stringify({ deviceId: this.o.deviceId, deviceLabel: this.o.label, events: batch }),
      })
      if (r.ok) {
        this.online = true
        this.outbox.splice(0, batch.length)
        this.persistOutbox()
        continue
      }
      if (r.status === 409) {
        this.outbox = []
        this.persistOutbox()
        this.ended({ status: r.data?.status ?? "completed", auditId: r.data?.auditId })
        return false
      }
      this.online = r.status !== 0 ? this.online : false
      return false
    }
    return true
  }

  private async pull(): Promise<void> {
    if (!this.sessionId) return
    for (let page = 0; page < 20; page++) {
      const q = new URLSearchParams({
        after: String(this.lastSeq),
        deviceId: this.o.deviceId,
        deviceLabel: this.o.label,
      })
      const r = await call<{
        status: string
        auditId?: string | null
        events: RemoteEvent[]
        lastSeq: number
        devices: SessionDevice[]
      }>(`/api/audit-sessions/${encodeURIComponent(this.sessionId)}/events?${q.toString()}`)
      if (!r.ok || !r.data) {
        this.online = r.status !== 0 ? this.online : false
        return
      }
      this.online = true
      this.devices = r.data.devices || []
      const events = r.data.events || []
      // Replaying a blank screen applies everything we haven't already counted here;
      // otherwise our own scans are already in the panels and only others' are needed.
      const mine = events.filter(
        (e) => !this.emitted.has(e.id) && (this.replayAll || e.deviceId !== this.o.deviceId),
      )
      if (mine.length > 0 || r.data.lastSeq !== this.lastSeq) {
        this.o.onRemote(mine, r.data.lastSeq)
      }
      this.lastSeq = r.data.lastSeq
      if (r.data.status !== "open") {
        this.ended({ status: r.data.status, auditId: r.data.auditId })
        return
      }
      if (events.length < 1000) {
        this.replayAll = false
        return
      }
    }
  }

  private ended(end: SessionEnd): void {
    this.stop()
    this.o.onEnded(end)
  }
}
