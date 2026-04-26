import { describe, expect, test } from 'bun:test'
import type { SimplePool } from 'nostr-tools/pool'
import { SimplePoolRelayAdapter } from '../../../../src/infrastructure/adapters/outbound/SimplePoolRelayAdapter.js'
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
    subscribeMany: () => ({ close: () => {} }),
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
    subscribeMany: () => ({ close: () => {} }),
  } as unknown as SimplePool
}

describe('SimplePoolRelayAdapter.publish', () => {
  test('returns signed event after at least one relay accepts', async () => {
    const { port: keyProvider } = makeKeyProvider({ pubkey: 'pk-customer' })
    const adapter = new SimplePoolRelayAdapter(
      makePool([
        () => Promise.reject(new Error('relay-a failed')),
        () => Promise.resolve('ok'),
      ]),
      keyProvider,
      ['wss://relay-a.example', 'wss://relay-b.example'],
    )

    const signed = await adapter.publish({
      kind: 7700,
      tags: [],
      content: 'ticket',
      created_at: 1,
    })

    expect(signed.pubkey).toBe('pk-customer')
  })

  test('rejects when every relay publish fails', async () => {
    const { port: keyProvider } = makeKeyProvider({ pubkey: 'pk-customer' })
    const adapter = new SimplePoolRelayAdapter(
      makePool([
        () => Promise.reject(new Error('relay-a failed')),
        () => Promise.reject(new Error('relay-b failed')),
      ]),
      keyProvider,
      ['wss://relay-a.example', 'wss://relay-b.example'],
    )

    await expect(adapter.publish({
      kind: 7700,
      tags: [],
      content: 'ticket',
      created_at: 1,
    })).rejects.toThrow()
  })

  test('rejects when every relay connection fails before publish', async () => {
    const { port: keyProvider } = makeKeyProvider({ pubkey: 'pk-customer' })
    const adapter = new SimplePoolRelayAdapter(
      makeConnectionFailurePool(),
      keyProvider,
      ['wss://relay.example'],
    )

    await expect(adapter.publish({
      kind: 7700,
      tags: [],
      content: 'ticket',
      created_at: 1,
    })).rejects.toThrow()
  })
})
