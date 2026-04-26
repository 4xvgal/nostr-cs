import { writable } from 'svelte/store'
import type { CSClient } from 'nostr-cs'

const D_TAG = 'blossom-eph-keys'

export interface KeyringEntry {
  nsec: string
  uploadedAt: number
  ticketId?: string
  size?: number
  mime?: string
  name?: string
  servers?: string[]
}

interface KeyringState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  entries: Map<string, KeyringEntry>
  errorMsg?: string
}

const store = writable<KeyringState>({ status: 'idle', entries: new Map() })

export const keyring = {
  subscribe: store.subscribe,
}

let activeClient: CSClient | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

function snapshotMap(): Map<string, KeyringEntry> {
  let snap = new Map<string, KeyringEntry>()
  store.update((s) => {
    snap = s.entries
    return s
  })
  return snap
}

function scheduleSave(): void {
  if (!activeClient) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void persist()
  }, 300)
}

async function persist(): Promise<void> {
  if (!activeClient) return
  const map = snapshotMap()
  const obj = Object.fromEntries(map.entries())
  try {
    await activeClient.appDataSave(D_TAG, JSON.stringify({ v: 1, entries: obj }))
  } catch (e) {
    console.warn('keyring persist failed:', e)
  }
}

export async function initKeyring(client: CSClient): Promise<void> {
  activeClient = client
  store.update((s) => ({ ...s, status: 'loading', errorMsg: undefined }))
  try {
    const raw = await client.appDataLoad(D_TAG, 4000)
    if (raw) {
      const parsed = JSON.parse(raw) as {
        v?: number
        entries?: Record<string, KeyringEntry>
      }
      const entries = new Map<string, KeyringEntry>()
      for (const [k, v] of Object.entries(parsed.entries ?? {})) {
        if (v && typeof v === 'object' && typeof v.nsec === 'string') {
          entries.set(k, v)
        }
      }
      store.set({ status: 'ready', entries })
    } else {
      store.set({ status: 'ready', entries: new Map() })
    }
  } catch (e) {
    store.set({
      status: 'error',
      entries: new Map(),
      errorMsg: e instanceof Error ? e.message : String(e),
    })
  }
}

export function record(blobSha256: string, entry: KeyringEntry): void {
  store.update((s) => {
    const next = new Map(s.entries)
    next.set(blobSha256, entry)
    return { ...s, entries: next }
  })
  scheduleSave()
}

export function forget(blobSha256: string): void {
  store.update((s) => {
    const next = new Map(s.entries)
    next.delete(blobSha256)
    return { ...s, entries: next }
  })
  scheduleSave()
}

export function get(blobSha256: string): KeyringEntry | undefined {
  return snapshotMap().get(blobSha256)
}

export function reset(): void {
  activeClient = null
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  store.set({ status: 'idle', entries: new Map() })
}
