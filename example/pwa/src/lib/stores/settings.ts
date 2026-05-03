import { writable } from 'svelte/store'
import { browser } from '$app/environment'
import {
  PUBLIC_BOOTSTRAP_RELAYS,
  PUBLIC_WRITE_RELAYS,
  PUBLIC_READ_RELAYS,
  PUBLIC_DM_RELAYS,
} from '$env/static/public'

export type StoredKey =
  | { type: 'nsec'; value: string }
  | { type: 'hex'; value: string }
  | { type: 'nip07' }
  | { type: 'nip46'; bunkerUri: string }

export interface StoredSettings {
  key: StoredKey | null
  role: 'agent' | 'customer' | null
  profileName: string
  relays: {
    bootstrap: string[]
    write: string[]
    read: string[]
    dm: string[]
  }
  stripImageMetadata: boolean
  obfuscateFilename: boolean
}

function parseRelayList(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('wss://') || s.startsWith('ws://'))
}

const FALLBACK_BOOTSTRAP = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band']

const ENV_BOOTSTRAP = parseRelayList(PUBLIC_BOOTSTRAP_RELAYS)

const DEFAULT_RELAYS = {
  bootstrap: ENV_BOOTSTRAP.length > 0 ? ENV_BOOTSTRAP : FALLBACK_BOOTSTRAP,
  write: parseRelayList(PUBLIC_WRITE_RELAYS),
  read: parseRelayList(PUBLIC_READ_RELAYS),
  dm: parseRelayList(PUBLIC_DM_RELAYS),
}

const STORAGE_KEY = 'nostr-cs-pwa:v1'

function loadInitial(): StoredSettings {
  const blank: StoredSettings = {
    key: null,
    role: null,
    profileName: '',
    relays: { ...DEFAULT_RELAYS },
    stripImageMetadata: true,
    obfuscateFilename: true,
  }
  if (!browser) return blank
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return blank
    const parsed = JSON.parse(raw) as Partial<StoredSettings>
    return {
      key: parsed.key ?? null,
      role: parsed.role ?? null,
      profileName: parsed.profileName ?? '',
      relays: {
        bootstrap: parsed.relays?.bootstrap ?? DEFAULT_RELAYS.bootstrap,
        write: parsed.relays?.write ?? [],
        read: parsed.relays?.read ?? [],
        dm: parsed.relays?.dm ?? [],
      },
      stripImageMetadata: parsed.stripImageMetadata ?? true,
      obfuscateFilename: parsed.obfuscateFilename ?? true,
    }
  } catch {
    return blank
  }
}

export const settings = writable<StoredSettings>(loadInitial())

if (browser) {
  settings.subscribe((value) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    } catch {}
  })
}

export function clearSettings(): void {
  settings.set({ key: null, role: null, profileName: '', relays: { ...DEFAULT_RELAYS }, stripImageMetadata: true, obfuscateFilename: true })
}
