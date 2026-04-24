import { describe, test, expect } from 'bun:test'
import { BootstrapUseCase } from '../../../../src/application/use-cases/publish/BootstrapUseCase.js'
import {
  makeKeyProvider,
  makeProfilePort,
  makeRelayIndex,
} from '../../../support/mocks.js'

const CONFIG = {
  bootstrap: ['wss://boot1.example', 'wss://boot2.example'],
  write: ['wss://w.example'],
  read: ['wss://r.example'],
  dm: ['wss://dm.example'],
}

describe('BootstrapUseCase', () => {
  test('spread = bootstrap ∪ public, publishes relaySet + dm + profile when meta provided', async () => {
    const { port: profilePort, rec: prec } = makeProfilePort({})
    const { port: relayIndex } = makeRelayIndex({
      urls: ['wss://pub1.example', 'wss://boot1.example'],
    })
    const { port: keyProvider } = makeKeyProvider({ pubkey: 'pk-self' })

    const uc = new BootstrapUseCase(profilePort, relayIndex, keyProvider, CONFIG, {
      name: 'Alice',
      csRole: 'agent',
    })
    await uc.execute()

    expect(prec.publishRelaySet).toHaveLength(1)
    const spread = prec.publishRelaySet[0]!.targetRelays
    // bootstrap ∪ pub, deduped. order: boot1, boot2, pub1 (boot1 already present).
    expect([...spread].sort()).toEqual(
      ['wss://boot1.example', 'wss://boot2.example', 'wss://pub1.example'].sort(),
    )
    expect(prec.publishRelaySet[0]!.relaySet.write).toEqual(['wss://w.example'])
    expect(prec.publishRelaySet[0]!.relaySet.read).toEqual(['wss://r.example'])

    expect(prec.publishDMRelays).toHaveLength(1)
    expect(prec.publishDMRelays[0]!.dmRelays).toEqual(['wss://dm.example'])

    expect(prec.publishProfile).toHaveLength(1)
  })

  test('skips DM publish when config.dm is empty', async () => {
    const { port: profilePort, rec: prec } = makeProfilePort({})
    const { port: relayIndex } = makeRelayIndex({ urls: [] })
    const { port: keyProvider } = makeKeyProvider({ pubkey: 'pk-self' })

    const uc = new BootstrapUseCase(
      profilePort,
      relayIndex,
      keyProvider,
      { ...CONFIG, dm: [] },
      { name: 'A', csRole: 'agent' },
    )
    await uc.execute()

    expect(prec.publishDMRelays).toHaveLength(0)
    expect(prec.publishRelaySet).toHaveLength(1)
    expect(prec.publishProfile).toHaveLength(1)
  })

  test('skips profile publish when meta not provided', async () => {
    const { port: profilePort, rec: prec } = makeProfilePort({})
    const { port: relayIndex } = makeRelayIndex({ urls: [] })
    const { port: keyProvider } = makeKeyProvider({ pubkey: 'pk-self' })

    const uc = new BootstrapUseCase(profilePort, relayIndex, keyProvider, CONFIG)
    await uc.execute()

    expect(prec.publishProfile).toHaveLength(0)
    expect(prec.publishRelaySet).toHaveLength(1)
    expect(prec.publishDMRelays).toHaveLength(1)
  })

  test('tolerates relayIndex failure — spread falls back to bootstrap only', async () => {
    const { port: profilePort, rec: prec } = makeProfilePort({})
    const { port: relayIndex } = makeRelayIndex({ fail: true })
    const { port: keyProvider } = makeKeyProvider({ pubkey: 'pk-self' })

    const uc = new BootstrapUseCase(profilePort, relayIndex, keyProvider, CONFIG)
    await uc.execute()

    expect(prec.publishRelaySet[0]!.targetRelays).toEqual([
      'wss://boot1.example',
      'wss://boot2.example',
    ])
  })
})
