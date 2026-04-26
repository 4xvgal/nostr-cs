import { describe, test, expect } from 'bun:test'
import { ReplyTicketUseCase } from '../../../../src/application/use-cases/publish/ReplyTicketUseCase.js'
import { TicketId } from '../../../../src/domain/value-objects/TicketId.js'
import {
  makeNostrEvent,
  makeCrypto,
  makeRelayDiscovery,
} from '../../../support/mocks.js'

describe('ReplyTicketUseCase', () => {
  test('publishes kind 7702 with e-tag, ticket_id, p-tag=customer; content encrypted', async () => {
    const { port: nostrEvent, rec: nrec } = makeNostrEvent()
    const { port: crypto, rec: crec } = makeCrypto()
    const discovery = makeRelayDiscovery({
      publishRelaysByPubkey: { 'pk-customer': ['wss://c.example'] },
    })

    const tid = TicketId.generate()
    const uc = new ReplyTicketUseCase(nostrEvent, crypto, discovery)
    await uc.execute({
      ticketId: tid,
      threadRoot: 'root-event-id',
      body: 'we are on it',
      customerPubkey: 'pk-customer',
    })

    expect(nrec.publish).toHaveLength(1)
    const { event, targetRelays } = nrec.publish[0]!
    expect(event.kind).toBe(7702)
    expect(targetRelays).toEqual(['wss://c.example'])
    const tagMap = Object.fromEntries(event.tags.map((t) => [t[0], t[1]]))
    expect(tagMap['e']).toBe('root-event-id')
    expect(tagMap['ticket_id']).toBe(tid.toString())
    expect(tagMap['p']).toBe('pk-customer')

    expect(crec.encrypt).toHaveLength(1)
    expect(crec.encrypt[0]!.recipient).toBe('pk-customer')
    const payload = JSON.parse(crec.encrypt[0]!.plaintext)
    expect(payload).toEqual({ ticket_id: tid.toString(), body: 'we are on it' })
  })
})
