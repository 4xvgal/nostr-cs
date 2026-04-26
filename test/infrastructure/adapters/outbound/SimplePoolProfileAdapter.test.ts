import { describe, expect, test } from 'bun:test'
import type { SimplePool } from 'nostr-tools/pool'
import { SimplePoolProfileAdapter } from '../../../../src/infrastructure/adapters/outbound/SimplePoolProfileAdapter.js'
import { NostrProfile } from '../../../../src/domain/entities/NostrProfile.js'
import { RelaySet } from '../../../../src/domain/value-objects/RelaySet.js'
import { makeKeyProvider } from '../../../support/mocks.js'

function makePool(results: Array<() => Promise<string>>): SimplePool {
  return {
    maxWaitForConnection: 3000,
    seenOn: new Map(),
    trackRelays: false,
    ensureRelay: async () => ({
      publish: () => {
        const result = results.shift()
        if (!result) throw new Error('unexpected publish')
        return result()
      },
    }),
    querySync: async () => [],
  } as unknown as SimplePool
}

function makeConnectionFailurePool(): SimplePool {
  return {
    maxWaitForConnection: 3000,
    seenOn: new Map(),
    trackRelays: false,
    ensureRelay: async () => {
      throw new Error('connection failed')
    },
    querySync: async () => [],
  } as unknown as SimplePool
}

describe('SimplePoolProfileAdapter publish methods', () => {
  test('publishRelaySet rejects when every relay publish fails', async () => {
    const { port: keyProvider } = makeKeyProvider({ pubkey: 'pk-customer' })
    const adapter = new SimplePoolProfileAdapter(
      makePool([() => Promise.reject(new Error('relay failed'))]),
      keyProvider,
      ['wss://relay.example'],
    )

    await expect(adapter.publishRelaySet(
      new RelaySet(['wss://write.example'], ['wss://read.example']),
      ['wss://relay.example'],
    )).rejects.toThrow()
  })

  test('publishRelaySet rejects when every relay connection fails before publish', async () => {
    const { port: keyProvider } = makeKeyProvider({ pubkey: 'pk-customer' })
    const adapter = new SimplePoolProfileAdapter(
      makeConnectionFailurePool(),
      keyProvider,
      ['wss://relay.example'],
    )

    await expect(adapter.publishRelaySet(
      new RelaySet(['wss://write.example'], ['wss://read.example']),
      ['wss://relay.example'],
    )).rejects.toThrow()
  })

  test('publishDMRelays rejects when every relay publish fails', async () => {
    const { port: keyProvider } = makeKeyProvider({ pubkey: 'pk-customer' })
    const adapter = new SimplePoolProfileAdapter(
      makePool([() => Promise.reject(new Error('relay failed'))]),
      keyProvider,
      ['wss://relay.example'],
    )

    await expect(adapter.publishDMRelays(
      ['wss://dm.example'],
      ['wss://relay.example'],
    )).rejects.toThrow()
  })

  test('publishProfile rejects when every relay publish fails', async () => {
    const { port: keyProvider } = makeKeyProvider({ pubkey: 'pk-customer' })
    const adapter = new SimplePoolProfileAdapter(
      makePool([() => Promise.reject(new Error('relay failed'))]),
      keyProvider,
      ['wss://relay.example'],
    )

    const profile = new NostrProfile(
      'pk-customer',
      'Alice',
      '',
      '',
      'customer',
      new RelaySet(['wss://write.example'], ['wss://read.example']),
    )

    await expect(adapter.publishProfile(profile, ['wss://relay.example'])).rejects.toThrow()
  })
})
