import { describe, test, expect } from 'bun:test'
import { SubmitCsatUseCase } from '../../../../src/application/use-cases/publish/SubmitCsatUseCase.js'
import { TicketId } from '../../../../src/domain/value-objects/TicketId.js'
import {
  makeNostrEvent,
  makeCrypto,
  makeRelayDiscovery,
} from '../../../support/mocks.js'

describe('SubmitCsatUseCase', () => {
  test('publishes kind 7704 with rating + comment encrypted to agent and no rating tag', async () => {
    const { port: nostrEvent, rec: nrec } = makeNostrEvent()
    const { port: crypto, rec: crec } = makeCrypto()
    const discovery = makeRelayDiscovery({
      publishRelaysByPubkey: { 'pk-agent': ['wss://a.example'] },
    })

    const tid = TicketId.generate()
    const uc = new SubmitCsatUseCase(nostrEvent, crypto, discovery)
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
    expect(targetRelays).toEqual(['wss://a.example'])

    // Encrypted body uses the makeCrypto fake's `enc(recipient):plaintext` form
    expect(crec.encrypt).toHaveLength(1)
    expect(crec.encrypt[0]!.recipient).toBe('pk-agent')
    expect(JSON.parse(crec.encrypt[0]!.plaintext)).toEqual({ rating: 5, comment: 'great help' })
    expect(event.content).toBe('enc(pk-agent):' + JSON.stringify({ rating: 5, comment: 'great help' }))

    const tagMap = Object.fromEntries(event.tags.map((t) => [t[0], t[1]]))
    expect(tagMap['e']).toBe('root-id')
    expect(tagMap['ticket_id']).toBe(tid.toString())
    expect(tagMap['p']).toBe('pk-agent')
    expect(tagMap['rating']).toBeUndefined()
  })
})
