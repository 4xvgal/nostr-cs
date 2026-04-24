import { describe, test, expect } from 'bun:test'
import { UpdateStatusUseCase } from '../../../../src/application/use-cases/publish/UpdateStatusUseCase.js'
import { TicketId } from '../../../../src/domain/value-objects/TicketId.js'
import {
  makeNostrEvent,
  makeKeyProvider,
  makeRelayDiscovery,
} from '../../../support/mocks.js'

describe('UpdateStatusUseCase', () => {
  test('publishes kind 7701 with empty content and status tag', async () => {
    const { port: nostrEvent, rec: nrec } = makeNostrEvent()
    const { port: keyProvider } = makeKeyProvider({ pubkey: 'pk-agent' })
    const discovery = makeRelayDiscovery({
      publishRelaysByPubkey: { 'pk-customer': ['wss://c.example'] },
    })

    const tid = TicketId.generate()
    const uc = new UpdateStatusUseCase(nostrEvent, keyProvider, discovery)
    await uc.execute({
      ticketId: tid,
      threadRoot: 'root-id',
      newStatus: 'in_progress',
      customerPubkey: 'pk-customer',
    })

    expect(nrec.publish).toHaveLength(1)
    const { event, targetRelays } = nrec.publish[0]!
    expect(event.kind).toBe(7701)
    expect(event.content).toBe('')
    expect(targetRelays).toEqual(['wss://c.example'])
    const tagMap = Object.fromEntries(event.tags.map((t) => [t[0], t[1]]))
    expect(tagMap['e']).toBe('root-id')
    expect(tagMap['ticket_id']).toBe(tid.toString())
    expect(tagMap['status']).toBe('in_progress')
    expect(tagMap['p']).toBe('pk-customer')
  })

  test('signAndPublish path: no nostrEvent.publish', async () => {
    const { port: nostrEvent, rec: nrec } = makeNostrEvent()
    const { port: keyProvider, rec: krec } = makeKeyProvider({
      pubkey: 'pk-agent',
      withSignAndPublish: true,
    })
    const discovery = makeRelayDiscovery({
      publishRelaysByPubkey: { 'pk-customer': ['wss://c.example'] },
    })

    const uc = new UpdateStatusUseCase(nostrEvent, keyProvider, discovery)
    await uc.execute({
      ticketId: TicketId.generate(),
      threadRoot: 'r',
      newStatus: 'resolved',
      customerPubkey: 'pk-customer',
    })

    expect(nrec.publish).toHaveLength(0)
    expect(krec.signAndPublishCalls).toHaveLength(1)
    expect(krec.signAndPublishCalls[0]!.raw.kind).toBe(7701)
  })
})
