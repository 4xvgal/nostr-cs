import { describe, test, expect } from 'bun:test'
import { SendDMUseCase } from '../../../../src/application/use-cases/publish/SendDMUseCase.js'
import { TicketId } from '../../../../src/domain/value-objects/TicketId.js'
import {
  makeNostrEvent,
  makeCrypto,
  makeKeyProvider,
  makeRelayDiscovery,
} from '../../../support/mocks.js'

describe('SendDMUseCase', () => {
  test('builds rumor (kind 14), seals it, publishes the signed gift wrap to DM relays', async () => {
    const { port: nostrEvent, rec: nrec } = makeNostrEvent()
    const { port: crypto, rec: crec } = makeCrypto()
    const { port: keyProvider } = makeKeyProvider({ pubkey: 'pk-sender' })
    const discovery = makeRelayDiscovery({
      dmRelaysByPubkey: { 'pk-recipient': ['wss://dm.example'] },
      publishRelaysByPubkey: { 'pk-recipient': ['wss://r.example'] },
    })

    const tid = TicketId.generate()
    const uc = new SendDMUseCase(nostrEvent, crypto, keyProvider, discovery)
    await uc.execute({
      ticketId: tid,
      threadRoot: 'root',
      content: 'hi there',
      recipientPubkey: 'pk-recipient',
    })

    expect(crec.sealAndWrap).toHaveLength(1)
    const { rumor, recipient } = crec.sealAndWrap[0]!
    expect(rumor.kind).toBe(14)
    expect(rumor.content).toBe('hi there')
    expect(recipient).toBe('pk-recipient')
    const rumorTagMap = Object.fromEntries(rumor.tags.map((t) => [t[0], t[1]]))
    expect(rumorTagMap['e']).toBe('root')
    expect(rumorTagMap['ticket_id']).toBe(tid.toString())
    expect(rumorTagMap['p']).toBe('pk-recipient')

    expect(nrec.publish).toHaveLength(1)
    const { event, targetRelays } = nrec.publish[0]!
    // Adapter contract: the object passed to publish already carries a signature.
    expect('sig' in event ? event.sig : '').toBe('wrap-sig')
    expect(event.kind).toBe(1059)
    expect(targetRelays).toEqual(['wss://dm.example'])
  })

  test('uses getDMRelays (not getPublishRelays) for routing', async () => {
    const { port: nostrEvent, rec: nrec } = makeNostrEvent()
    const { port: crypto } = makeCrypto()
    const { port: keyProvider } = makeKeyProvider({ pubkey: 'pk-sender' })
    // Only DM relays configured — publish relays cascade would pick boot otherwise.
    const discovery = makeRelayDiscovery({
      dmRelaysByPubkey: { 'pk-recipient': ['wss://dm-only.example'] },
      bootstrap: ['wss://boot.example'],
    })

    const uc = new SendDMUseCase(nostrEvent, crypto, keyProvider, discovery)
    await uc.execute({
      ticketId: TicketId.generate(),
      threadRoot: 'r',
      content: 'c',
      recipientPubkey: 'pk-recipient',
    })

    expect(nrec.publish[0]!.targetRelays).toEqual(['wss://dm-only.example'])
  })
})
