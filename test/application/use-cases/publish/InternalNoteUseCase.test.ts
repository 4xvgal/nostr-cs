import { describe, test, expect } from 'bun:test'
import { InternalNoteUseCase } from '../../../../src/application/use-cases/publish/InternalNoteUseCase.js'
import { TicketId } from '../../../../src/domain/value-objects/TicketId.js'
import {
  makeNostrEvent,
  makeCrypto,
  makeRelayDiscovery,
} from '../../../support/mocks.js'

describe('InternalNoteUseCase', () => {
  test('publishes one kind 7703 event per recipient, each with their own relays + encryption', async () => {
    const { port: nostrEvent, rec: nrec } = makeNostrEvent()
    const { port: crypto, rec: crec } = makeCrypto()
    const discovery = makeRelayDiscovery({
      publishRelaysByPubkey: {
        'pk-a2': ['wss://a2.example'],
        'pk-a3': ['wss://a3.example'],
        'pk-a4': ['wss://a4.example'],
      },
    })

    const tid = TicketId.generate()
    const uc = new InternalNoteUseCase(nostrEvent, crypto, discovery)
    await uc.execute({
      ticketId: tid,
      threadRoot: 'root',
      body: 'heads up',
      otherAgentPubkeys: ['pk-a2', 'pk-a3', 'pk-a4'],
    })

    expect(nrec.publish).toHaveLength(3)
    expect(crec.encrypt).toHaveLength(3)

    const byRecipient = new Map<string, { relays: string[] | undefined; event: typeof nrec.publish[0]['event'] }>()
    for (const { event, targetRelays } of nrec.publish) {
      const p = event.tags.find((t) => t[0] === 'p')?.[1]
      expect(p).toBeDefined()
      byRecipient.set(p as string, { relays: targetRelays, event })
    }

    expect(byRecipient.get('pk-a2')!.relays).toEqual(['wss://a2.example'])
    expect(byRecipient.get('pk-a3')!.relays).toEqual(['wss://a3.example'])
    expect(byRecipient.get('pk-a4')!.relays).toEqual(['wss://a4.example'])

    for (const { event } of byRecipient.values()) {
      expect(event.kind).toBe(7703)
      const tagMap = Object.fromEntries(event.tags.map((t) => [t[0], t[1]]))
      expect(tagMap['e']).toBe('root')
      expect(tagMap['ticket_id']).toBe(tid.toString())
    }

    const recipients = crec.encrypt.map((e) => e.recipient).sort()
    expect(recipients).toEqual(['pk-a2', 'pk-a3', 'pk-a4'])
  })

  test('empty recipient list → no publishes at all', async () => {
    const { port: nostrEvent, rec: nrec } = makeNostrEvent()
    const { port: crypto, rec: crec } = makeCrypto()
    const discovery = makeRelayDiscovery({})

    const uc = new InternalNoteUseCase(nostrEvent, crypto, discovery)
    await uc.execute({
      ticketId: TicketId.generate(),
      threadRoot: 'r',
      body: 'b',
      otherAgentPubkeys: [],
    })

    expect(nrec.publish).toHaveLength(0)
    expect(crec.encrypt).toHaveLength(0)
  })
})
