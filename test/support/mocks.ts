import type {
  NostrEventPort,
  UnsignedEvent,
  SignedEvent,
  SubscriptionFilter,
} from '../../src/application/ports/outbound/NostrEventPort.js'
import type {
  CryptoPort,
  Nip17Rumor,
  Nip17Unsealed,
} from '../../src/application/ports/outbound/CryptoPort.js'
import type { KeyProvider } from '../../src/application/ports/outbound/KeyProvider.js'
import type {
  EventBusPort,
  CSEvent,
} from '../../src/application/ports/outbound/EventBusPort.js'
import type { ProfilePort } from '../../src/application/ports/outbound/ProfilePort.js'
import type { RelayIndexPort } from '../../src/application/ports/outbound/RelayIndexPort.js'
import { RelayDiscoveryService } from '../../src/domain/services/RelayDiscoveryService.js'
import { RelaySet } from '../../src/domain/value-objects/RelaySet.js'

// ── NostrEvent ─────────────────────────────────────────────────────────

export interface NostrEventRecorder {
  publish: { event: UnsignedEvent | SignedEvent; targetRelays: string[] | undefined }[]
  subscribe: {
    filter: SubscriptionFilter
    onEvent: (event: SignedEvent) => void
    relays: string[] | undefined
  }[]
  closes: number
}

export function makeNostrEvent(): {
  port: NostrEventPort
  rec: NostrEventRecorder
} {
  const rec: NostrEventRecorder = { publish: [], subscribe: [], closes: 0 }
  const port: NostrEventPort = {
    publish: async (event, targetRelays) => {
      rec.publish.push({ event, targetRelays })
      const hasSig = 'sig' in event && typeof (event as SignedEvent).sig === 'string'
      return {
        ...event,
        id: hasSig ? (event as SignedEvent).id : 'id-' + rec.publish.length,
        pubkey: hasSig ? (event as SignedEvent).pubkey : 'pk-self',
        sig: hasSig ? (event as SignedEvent).sig : 'sig-' + rec.publish.length,
      }
    },
    subscribe: (filter, onEvent, opts) => {
      rec.subscribe.push({ filter, onEvent, relays: opts?.relays })
      return {
        close: () => {
          rec.closes++
        },
      }
    },
  }
  return { port, rec }
}

// ── Crypto ─────────────────────────────────────────────────────────────

export interface CryptoRecorder {
  encrypt: { plaintext: string; recipient: string }[]
  decrypt: { ciphertext: string; sender: string }[]
  sealAndWrap: { rumor: Nip17Rumor; recipient: string }[]
  unwrapAndUnseal: { giftWrap: SignedEvent }[]
}

export interface CryptoOverrides {
  sealResult?: (rumor: Nip17Rumor, recipient: string) => SignedEvent
  unsealResult?: (wrap: SignedEvent) => Nip17Unsealed
  decryptResult?: (ct: string, sender: string) => string
}

export function makeCrypto(overrides: CryptoOverrides = {}): {
  port: CryptoPort
  rec: CryptoRecorder
} {
  const rec: CryptoRecorder = {
    encrypt: [],
    decrypt: [],
    sealAndWrap: [],
    unwrapAndUnseal: [],
  }
  const port: CryptoPort = {
    encrypt: async (plaintext, recipient) => {
      rec.encrypt.push({ plaintext, recipient })
      return `enc(${recipient}):${plaintext}`
    },
    decrypt: async (ciphertext, sender) => {
      rec.decrypt.push({ ciphertext, sender })
      return overrides.decryptResult
        ? overrides.decryptResult(ciphertext, sender)
        : `plain(${ciphertext})`
    },
    sealAndWrap: async (rumor, recipient) => {
      rec.sealAndWrap.push({ rumor, recipient })
      if (overrides.sealResult) return overrides.sealResult(rumor, recipient)
      return {
        kind: 1059,
        tags: [['p', recipient]],
        content: 'wrap-content',
        created_at: Math.floor(Date.now() / 1000),
        id: 'wrap-id',
        pubkey: 'pk-random',
        sig: 'wrap-sig',
      }
    },
    unwrapAndUnseal: async (giftWrap) => {
      rec.unwrapAndUnseal.push({ giftWrap })
      if (overrides.unsealResult) return overrides.unsealResult(giftWrap)
      return {
        kind: 14,
        pubkey: 'pk-sender',
        tags: [],
        content: 'plain',
        created_at: Math.floor(Date.now() / 1000),
      }
    },
  }
  return { port, rec }
}

// ── KeyProvider ────────────────────────────────────────────────────────

export interface KeyProviderRecorder {
  signAndPublishCalls: { raw: UnsignedEvent; targetRelays: string[] | undefined }[]
}

export function makeKeyProvider(input: {
  pubkey: string
  withSignAndPublish?: boolean
}): { port: KeyProvider; rec: KeyProviderRecorder } {
  const rec: KeyProviderRecorder = { signAndPublishCalls: [] }
  const base: KeyProvider = {
    getPubkey: async () => input.pubkey,
    getNDKSigner: () => {
      throw new Error('getNDKSigner not available in test')
    },
  }
  const port: KeyProvider = input.withSignAndPublish
    ? {
        ...base,
        signAndPublish: async (raw, targetRelays) => {
          rec.signAndPublishCalls.push({ raw, targetRelays })
          return {
            ...raw,
            id: 'ss-id-' + rec.signAndPublishCalls.length,
            pubkey: input.pubkey,
            sig: 'ss-sig-' + rec.signAndPublishCalls.length,
          }
        },
      }
    : base
  return { port, rec }
}

// ── EventBus ───────────────────────────────────────────────────────────

export interface EventBusRecorder {
  events: CSEvent[]
}

export function makeEventBus(): { port: EventBusPort; rec: EventBusRecorder } {
  const rec: EventBusRecorder = { events: [] }
  const port: EventBusPort = {
    emit: (event) => {
      rec.events.push(event)
    },
    on: () => () => {},
  }
  return { port, rec }
}

// ── ProfilePort ────────────────────────────────────────────────────────

export interface ProfilePortRecorder {
  fetchRelaySet: string[]
  publishRelaySet: { relaySet: RelaySet; targetRelays: string[] }[]
  fetchDMRelays: string[]
  publishDMRelays: { dmRelays: string[]; targetRelays: string[] }[]
  fetchProfile: { pubkey: string; hintRelays: string[] | undefined }[]
  publishProfile: { targetRelays: string[] }[]
}

export function makeProfilePort(config: {
  relaySetsByPubkey?: Record<string, RelaySet>
  dmRelaysByPubkey?: Record<string, string[]>
}): { port: ProfilePort; rec: ProfilePortRecorder } {
  const rec: ProfilePortRecorder = {
    fetchRelaySet: [],
    publishRelaySet: [],
    fetchDMRelays: [],
    publishDMRelays: [],
    fetchProfile: [],
    publishProfile: [],
  }
  const port: ProfilePort = {
    fetchRelaySet: async (pk) => {
      rec.fetchRelaySet.push(pk)
      const rs = config.relaySetsByPubkey?.[pk]
      if (!rs) throw new Error('no NIP-65 for ' + pk)
      return rs
    },
    publishRelaySet: async (relaySet, targetRelays) => {
      rec.publishRelaySet.push({ relaySet, targetRelays })
    },
    fetchDMRelays: async (pk) => {
      rec.fetchDMRelays.push(pk)
      const dm = config.dmRelaysByPubkey?.[pk]
      if (!dm) throw new Error('no kind 10050 for ' + pk)
      return dm
    },
    publishDMRelays: async (dmRelays, targetRelays) => {
      rec.publishDMRelays.push({ dmRelays, targetRelays })
    },
    fetchProfile: async (pubkey, hintRelays) => {
      rec.fetchProfile.push({ pubkey, hintRelays })
      throw new Error('not implemented')
    },
    publishProfile: async (_profile, targetRelays) => {
      rec.publishProfile.push({ targetRelays })
    },
  }
  return { port, rec }
}

// ── RelayIndex ─────────────────────────────────────────────────────────

export interface RelayIndexRecorder {
  calls: number
}

export function makeRelayIndex(input: {
  urls?: string[]
  fail?: boolean
}): { port: RelayIndexPort; rec: RelayIndexRecorder } {
  const rec: RelayIndexRecorder = { calls: 0 }
  const port: RelayIndexPort = {
    fetchPublicRelays: async () => {
      rec.calls++
      if (input.fail) throw new Error('monitors down')
      return input.urls ?? []
    },
  }
  return { port, rec }
}

// ── RelayDiscovery (domain service) ────────────────────────────────────

export function makeRelayDiscovery(config: {
  publishRelaysByPubkey?: Record<string, string[]>
  dmRelaysByPubkey?: Record<string, string[]>
  bootstrap?: string[]
}): RelayDiscoveryService {
  const port: ProfilePort = {
    fetchRelaySet: async (pk) => {
      const read = config.publishRelaysByPubkey?.[pk]
      if (read === undefined) throw new Error('no NIP-65 for ' + pk)
      return new RelaySet([], read)
    },
    publishRelaySet: async () => {},
    fetchDMRelays: async (pk) => {
      const dm = config.dmRelaysByPubkey?.[pk]
      if (dm === undefined) throw new Error('no dm for ' + pk)
      return dm
    },
    publishDMRelays: async () => {},
    fetchProfile: async () => {
      throw new Error('not implemented')
    },
    publishProfile: async () => {},
  }
  return new RelayDiscoveryService(port, config.bootstrap ?? ['wss://boot.example'])
}
