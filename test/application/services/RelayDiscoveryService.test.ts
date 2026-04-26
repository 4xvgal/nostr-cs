import { describe, test, expect } from 'bun:test'
import { RelayDiscoveryService } from '../../../src/application/services/RelayDiscoveryService.js'
import { RelaySet } from '../../../src/domain/value-objects/RelaySet.js'
import type { ProfilePort } from '../../../src/application/ports/outbound/ProfilePort.js'

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
