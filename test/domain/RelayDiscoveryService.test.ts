import { describe, test, expect } from 'bun:test'
import { RelayDiscoveryService } from '../../src/domain/services/RelayDiscoveryService.js'
import { RelaySet } from '../../src/domain/value-objects/RelaySet.js'
import { NostrProfile } from '../../src/domain/entities/NostrProfile.js'
import type { ProfilePort } from '../../src/application/ports/outbound/ProfilePort.js'

const BOOTSTRAP = ['wss://boot.example']

function makePort(overrides: Partial<ProfilePort>): ProfilePort {
  return {
    fetchRelaySet: async () => {
      throw new Error('not implemented')
    },
    publishRelaySet: async () => {},
    fetchDMRelays: async () => {
      throw new Error('not implemented')
    },
    publishDMRelays: async () => {},
    fetchProfile: async () => {
      throw new Error('not implemented')
    },
    publishProfile: async () => {},
    ...overrides,
  }
}

describe('resolveRelays', () => {
  test('returns ProfilePort result when it succeeds', async () => {
    const remote = new RelaySet(['wss://w.example'], ['wss://r.example'])
    const svc = new RelayDiscoveryService(
      makePort({ fetchRelaySet: async () => remote }),
      BOOTSTRAP,
    )
    const result = await svc.resolveRelays('pk')
    expect(result).toBe(remote)
  })

  test('falls back to bootstrap when ProfilePort throws', async () => {
    const svc = new RelayDiscoveryService(
      makePort({
        fetchRelaySet: async () => {
          throw new Error('no NIP-65')
        },
      }),
      BOOTSTRAP,
    )
    const rs = await svc.resolveRelays('pk')
    expect(rs.write).toEqual(BOOTSTRAP)
    expect(rs.read).toEqual(BOOTSTRAP)
  })
})

describe('getPublishRelays', () => {
  test('uses recipient read relays when available', async () => {
    const svc = new RelayDiscoveryService(
      makePort({
        fetchRelaySet: async () => new RelaySet([], ['wss://r.example']),
      }),
      BOOTSTRAP,
    )
    expect(await svc.getPublishRelays('pk')).toEqual(['wss://r.example'])
  })

  test('falls back to bootstrap when read is empty', async () => {
    const svc = new RelayDiscoveryService(
      makePort({
        fetchRelaySet: async () => new RelaySet(['wss://w.example'], []),
      }),
      BOOTSTRAP,
    )
    expect(await svc.getPublishRelays('pk')).toEqual(BOOTSTRAP)
  })

  test('falls back to bootstrap when ProfilePort throws', async () => {
    const svc = new RelayDiscoveryService(
      makePort({
        fetchRelaySet: async () => {
          throw new Error('no NIP-65')
        },
      }),
      BOOTSTRAP,
    )
    expect(await svc.getPublishRelays('pk')).toEqual(BOOTSTRAP)
  })
})

describe('getDMRelays', () => {
  test('uses kind 10050 relays when available', async () => {
    const svc = new RelayDiscoveryService(
      makePort({
        fetchDMRelays: async () => ['wss://dm.example'],
      }),
      BOOTSTRAP,
    )
    expect(await svc.getDMRelays('pk')).toEqual(['wss://dm.example'])
  })

  test('falls back to getPublishRelays when kind 10050 empty', async () => {
    const svc = new RelayDiscoveryService(
      makePort({
        fetchDMRelays: async () => [],
        fetchRelaySet: async () => new RelaySet([], ['wss://r.example']),
      }),
      BOOTSTRAP,
    )
    expect(await svc.getDMRelays('pk')).toEqual(['wss://r.example'])
  })

  test('falls back to getPublishRelays when fetchDMRelays throws', async () => {
    const svc = new RelayDiscoveryService(
      makePort({
        fetchDMRelays: async () => {
          throw new Error('no kind 10050')
        },
        fetchRelaySet: async () => new RelaySet([], ['wss://r.example']),
      }),
      BOOTSTRAP,
    )
    expect(await svc.getDMRelays('pk')).toEqual(['wss://r.example'])
  })

  test('falls back all the way to bootstrap when both throw', async () => {
    const svc = new RelayDiscoveryService(
      makePort({
        fetchDMRelays: async () => {
          throw new Error('no kind 10050')
        },
        fetchRelaySet: async () => {
          throw new Error('no NIP-65')
        },
      }),
      BOOTSTRAP,
    )
    expect(await svc.getDMRelays('pk')).toEqual(BOOTSTRAP)
  })
})

describe('resolveProfile', () => {
  test('uses the write relays from resolveRelays as hints', async () => {
    const remote = new RelaySet(['wss://w.example'], ['wss://r.example'])
    const profile = new NostrProfile('pk', 'Alice', '', '', 'customer', remote)
    let seenHints: string[] | undefined
    const svc = new RelayDiscoveryService(
      makePort({
        fetchRelaySet: async () => remote,
        fetchProfile: async (_pk, hints) => {
          seenHints = hints
          return profile
        },
      }),
      BOOTSTRAP,
    )
    const out = await svc.resolveProfile('pk')
    expect(out).toBe(profile)
    expect(seenHints).toEqual(['wss://w.example'])
  })
})
