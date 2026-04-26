import { describe, expect, test } from 'bun:test'
import type { Event as NtEvent } from 'nostr-tools/core'
import type { Filter } from 'nostr-tools/filter'
import type { SimplePool } from 'nostr-tools/pool'
import { CSClient } from '../src/CSClient.js'
import type { CSClientInfrastructure } from '../src/CSClient.js'
import type { RelayIndexPort } from '../src/application/ports/outbound/RelayIndexPort.js'
import { makeKeyProvider } from './support/mocks.js'

interface RecordingPool extends SimplePool {
  destroyed: number
  publishRelays: string[]
  queryRelays: string[][]
  subscribeRelays: string[][]
}

function makeRecordingPool(): RecordingPool {
  const pool = {
    maxWaitForConnection: 3000,
    seenOn: new Map(),
    trackRelays: false,
    destroyed: 0,
    publishRelays: [] as string[],
    queryRelays: [] as string[][],
    subscribeRelays: [] as string[][],
    ensureRelay: async (url: string) => ({
      publish: async (_event: NtEvent) => {
        pool.publishRelays.push(url)
        return 'ok'
      },
    }),
    querySync: async (relays: string[], _filter: Filter) => {
      pool.queryRelays.push(relays)
      return []
    },
    subscribeMany: (relays: string[]) => {
      pool.subscribeRelays.push(relays)
      return { close: () => {} }
    },
    destroy: () => {
      pool.destroyed += 1
    },
  } as unknown as RecordingPool

  return pool
}

describe('CSClient infrastructure injection', () => {
  test('uses injected relay index and does not query default relay index adapter', async () => {
    const pool = makeRecordingPool()
    const relayIndexCalls: unknown[] = []
    const relayIndex: RelayIndexPort = {
      fetchPublicRelays: async (filter) => {
        relayIndexCalls.push(filter)
        return ['wss://public.example']
      },
    }
    const { port: keyProvider } = makeKeyProvider({ pubkey: 'pk-customer' })

    const client = new CSClient({
      key: { type: 'signer', value: keyProvider },
      relays: {
        bootstrap: ['wss://bootstrap.example'],
        write: ['wss://write.example'],
        read: ['wss://read.example'],
        dm: [],
      },
      infrastructure: { pool, relayIndex },
    })

    await client.connect()
    await client.disconnect()

    expect(relayIndexCalls).toHaveLength(1)
    expect(pool.queryRelays).toEqual([])
    expect(pool.publishRelays).toContain('wss://bootstrap.example/')
    expect(pool.publishRelays).toContain('wss://public.example/')
  })

  test('does not destroy externally supplied pool on disconnect', async () => {
    const pool = makeRecordingPool()
    const { port: keyProvider } = makeKeyProvider({ pubkey: 'pk-customer' })

    const client = new CSClient({
      key: { type: 'signer', value: keyProvider },
      relays: {
        bootstrap: ['wss://bootstrap.example'],
        write: ['wss://write.example'],
        read: ['wss://read.example'],
        dm: [],
      },
      infrastructure: {
        pool,
        relayIndex: { fetchPublicRelays: async () => [] },
      },
    })

    await client.connect()
    await client.disconnect()

    expect(pool.destroyed).toBe(0)
  })

  test('requires explicit relay index when an external pool is supplied', async () => {
    const pool = makeRecordingPool()
    const { port: keyProvider } = makeKeyProvider({ pubkey: 'pk-customer' })

    const client = new CSClient({
      key: { type: 'signer', value: keyProvider },
      relays: {
        bootstrap: ['wss://bootstrap.example'],
        write: ['wss://write.example'],
        read: ['wss://read.example'],
        dm: [],
      },
      infrastructure: { pool } as unknown as CSClientInfrastructure,
    })

    await expect(client.connect()).rejects.toThrow(
      'relayIndex is required when injecting an external pool',
    )
  })
})
