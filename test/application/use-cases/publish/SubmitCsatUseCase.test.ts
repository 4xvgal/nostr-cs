import { describe, test, expect } from 'bun:test'
import { SubmitCsatUseCase } from '../../../../src/application/use-cases/publish/SubmitCsatUseCase.js'
import { TicketId } from '../../../../src/domain/value-objects/TicketId.js'
import {
  makeNostrEvent,
  makeRelayDiscovery,
} from '../../../support/mocks.js'

describe('SubmitCsatUseCase', () => {
  test('publishes kind 7704 with rating tag as string and comment in content (plaintext)', async () => {
    const { port: nostrEvent, rec: nrec } = makeNostrEvent()
    const discovery = makeRelayDiscovery({
      publishRelaysByPubkey: { 'pk-agent': ['wss://a.example'] },
    })

    const tid = TicketId.generate()
    const uc = new SubmitCsatUseCase(nostrEvent, discovery)
    await uc.execute({
      ticketId: tid,
      threadRoot: 'root-id',
      agentPubkey: 'pk-agent',
      rating: 5,
      comment: 'great help',
    })

    expect(nrec.publish).toHaveLength(1)
    const { event, targetRelays } = nrec.publish[0]!
    expect(event.kind).toBe(7704)
    expect(event.content).toBe('great help')
    expect(targetRelays).toEqual(['wss://a.example'])
    const tagMap = Object.fromEntries(event.tags.map((t) => [t[0], t[1]]))
    expect(tagMap['e']).toBe('root-id')
    expect(tagMap['ticket_id']).toBe(tid.toString())
    expect(tagMap['p']).toBe('pk-agent')
    expect(tagMap['rating']).toBe('5')
  })
})
