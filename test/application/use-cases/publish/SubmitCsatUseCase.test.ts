import { describe, test, expect } from 'bun:test'
import { SubmitCsatUseCase } from '../../../../src/application/use-cases/publish/SubmitCsatUseCase.js'
import { TicketId } from '../../../../src/domain/value-objects/TicketId.js'
import {
  makeNostrEvent,
  makeKeyProvider,
  makeRelayDiscovery,
} from '../../../support/mocks.js'

describe('SubmitCsatUseCase', () => {
  test('publishes kind 7704 with rating tag as string and comment in content (plaintext)', async () => {
    const { port: nostrEvent, rec: nrec } = makeNostrEvent()
    const { port: keyProvider } = makeKeyProvider({ pubkey: 'pk-customer' })
    const discovery = makeRelayDiscovery({
      publishRelaysByPubkey: { 'pk-agent': ['wss://a.example'] },
    })

    const tid = TicketId.generate()
    const uc = new SubmitCsatUseCase(nostrEvent, keyProvider, discovery)
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

  test('signAndPublish path: no nostrEvent.publish', async () => {
    const { port: nostrEvent, rec: nrec } = makeNostrEvent()
    const { port: keyProvider, rec: krec } = makeKeyProvider({
      pubkey: 'pk-customer',
      withSignAndPublish: true,
    })
    const discovery = makeRelayDiscovery({
      publishRelaysByPubkey: { 'pk-agent': ['wss://a.example'] },
    })

    const uc = new SubmitCsatUseCase(nostrEvent, keyProvider, discovery)
    await uc.execute({
      ticketId: TicketId.generate(),
      threadRoot: 'r',
      agentPubkey: 'pk-agent',
      rating: 3,
      comment: 'ok',
    })

    expect(nrec.publish).toHaveLength(0)
    expect(krec.signAndPublishCalls).toHaveLength(1)
    expect(krec.signAndPublishCalls[0]!.raw.kind).toBe(7704)
  })
})
