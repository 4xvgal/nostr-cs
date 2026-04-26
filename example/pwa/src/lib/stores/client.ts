import { writable } from 'svelte/store'
import {
  CSClient,
  NIP07KeyProvider,
  type CSClientConfig,
  type KeyInput,
} from 'nostr-cs'
import { connection } from './connection.js'
import { identity, type Identity } from './identity.js'
import {
  upsertTicket,
  pushReply,
  pushNote,
  pushMessage,
  pushStatus,
  setCsat,
  clearAll,
} from './tickets.js'
import type { StoredKey, StoredSettings } from './settings.js'
import {
  hydrateFromCache,
  startPersistence,
  stopPersistence,
  clearCache,
} from './persistence.js'
import { initKeyring, reset as resetKeyring } from '../blossom/keyring.js'

export const client = writable<CSClient | null>(null)

function toKeyInput(stored: StoredKey): KeyInput {
  if (stored.type === 'nsec') return { type: 'nsec', value: stored.value }
  if (stored.type === 'hex') return { type: 'hex', value: stored.value }
  if (stored.type === 'nip07') return { type: 'signer', value: new NIP07KeyProvider() }
  // NIP-46: not wired in this example (requires SimplePool + ephemeral client key)
  throw new Error('NIP-46 is not enabled in this example yet')
}

export async function connect(s: StoredSettings): Promise<void> {
  if (!s.key || !s.role) throw new Error('Missing key or role')
  connection.set({ state: 'connecting' })
  try {
    const cfg: CSClientConfig = {
      key: toKeyInput(s.key),
      relays: {
        bootstrap: s.relays.bootstrap as [string, ...string[]],
        ...(s.relays.write.length ? { write: s.relays.write } : {}),
        ...(s.relays.read.length ? { read: s.relays.read } : {}),
        ...(s.relays.dm.length ? { dm: s.relays.dm } : {}),
      },
      profile: { name: s.profileName || 'CSClient User', csRole: s.role },
    }
    const pk = await pubkeyFromConfig(s)
    // Hydrate from local cache *before* connecting so the UI has data immediately
    hydrateFromCache(pk)

    const c = new CSClient(cfg)
    await c.connect()

    c.onTicket((t) => upsertTicket(t))
    c.onReply((r) => pushReply(r))
    c.onNote((n) => pushNote(n))
    c.onStatusChange((u) => pushStatus(u))
    c.onMessage((m) => pushMessage(m))
    c.onCsat((csat) => setCsat(csat))

    const id: Identity = { pubkey: pk, role: s.role, profileName: s.profileName }
    identity.set(id)
    client.set(c)
    startPersistence(pk)
    connection.set({ state: 'connected' })

    // Pull own-authored history (events the framework's #p:[me] subscription misses)
    void c.pullOwnHistory().catch((e) => {
      console.warn('pullOwnHistory failed:', e)
    })

    // Hydrate Blossom ephemeral keyring (NIP-78 kind 30078) from relays
    void initKeyring(c).catch((e) => {
      console.warn('keyring init failed:', e)
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    connection.set({ state: 'error', error: msg })
    throw e
  }
}

export async function disconnect(): Promise<void> {
  let current: CSClient | null = null
  client.update((c) => {
    current = c
    return null
  })
  if (current) await (current as CSClient).disconnect()
  stopPersistence()
  resetKeyring()
  identity.set(null)
  clearAll()
  connection.set({ state: 'idle' })
}

export function wipeLocalCache(pubkey: string): void {
  stopPersistence()
  clearAll()
  clearCache(pubkey)
}

async function pubkeyFromConfig(s: StoredSettings): Promise<string> {
  const k = s.key
  if (!k) throw new Error('no key')
  if (k.type === 'hex') return k.value.toLowerCase()
  if (k.type === 'nsec') {
    const { nip19, getPublicKey } = await import('nostr-tools')
    const decoded = nip19.decode(k.value)
    if (decoded.type !== 'nsec') throw new Error('not an nsec')
    return getPublicKey(decoded.data)
  }
  if (k.type === 'nip07') {
    if (!window.nostr) throw new Error('NIP-07 unavailable')
    return window.nostr.getPublicKey()
  }
  throw new Error('Unsupported key type: ' + (k as { type: string }).type)
}
