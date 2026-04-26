import { describe, expect, test } from 'bun:test'
import type { Event as NtEvent } from 'nostr-tools/core'
import type { Filter } from 'nostr-tools/filter'
import type { SimplePool } from 'nostr-tools/pool'
import { SimplePoolRelayIndexAdapter } from '../../../../src/infrastructure/adapters/outbound/SimplePoolRelayIndexAdapter.js'

interface RecordingPool extends SimplePool {
  queries: Array<{ relays: string[]; filter: Filter }>
}

function makePool(): RecordingPool {
  const pool = {
    maxWaitForConnection: 3000,
    seenOn: new Map(),
    trackRelays: false,
    queries: [] as Array<{ relays: string[]; filter: Filter }>,
    querySync: async (relays: string[], filter: Filter) => {
      pool.queries.push({ relays, filter })
      return [
        {
          kind: 30166,
          tags: [
            ['d', 'wss://relay-one.example'],
            ['d', 'https://not-a-relay.example'],
          ],
          content: '',
          created_at: 1,
          id: 'event-id',
          pubkey: 'pubkey',
          sig: 'sig',
        } as NtEvent,
      ]
    },
  } as unknown as RecordingPool

  return pool
}

describe('SimplePoolRelayIndexAdapter', () => {
  test('queries caller-provided monitor relays', async () => {
    const pool = makePool()
    const adapter = new SimplePoolRelayIndexAdapter(pool, [
      'wss://monitor-a.example',
      'wss://monitor-b.example',
    ])

    const relays = await adapter.fetchPublicRelays({
      noPayment: true,
      noAuth: true,
      limit: 5,
    })

    expect(pool.queries[0]!.relays).toEqual([
      'wss://monitor-a.example',
      'wss://monitor-b.example',
    ])
    expect(pool.queries[0]!.filter.kinds).toEqual([30166])
    expect(pool.queries[0]!.filter.limit).toBe(5)
    expect((pool.queries[0]!.filter as unknown as Record<string, string[]>)['#R'])
      .toEqual(['!payment', '!auth'])
    expect(relays).toEqual(['wss://relay-one.example'])
  })
})
