import { describe, test, expect } from 'bun:test'
import { CreateTicketUseCase } from '../../../../src/application/use-cases/publish/CreateTicketUseCase.js'
import { Ticket } from '../../../../src/domain/entities/Ticket.js'
import {
  makeNostrEvent,
  makeCrypto,
  makeKeyProvider,
  makeEventBus,
  makeRelayDiscovery,
} from '../../../support/mocks.js'

const PARAMS = {
  title: 'outage',
  body: 'site is down',
  agentPubkey: 'pk-agent',
  priority: 'high' as const,
  category: 'technical' as const,
}

describe('CreateTicketUseCase', () => {
  test('nostrEvent path: publishes kind 7700 with all tags + encrypted content', async () => {
    const { port: nostrEvent, rec: nrec } = makeNostrEvent()
    const { port: crypto, rec: crec } = makeCrypto()
    const { port: keyProvider } = makeKeyProvider({ pubkey: 'pk-customer' })
    const { port: eventBus, rec: erec } = makeEventBus()
    const discovery = makeRelayDiscovery({
      publishRelaysByPubkey: { 'pk-agent': ['wss://agent.example'] },
    })

    const uc = new CreateTicketUseCase(nostrEvent, crypto, keyProvider, discovery, eventBus)
    const ticket = await uc.execute(PARAMS)

    expect(ticket).toBeInstanceOf(Ticket)
    expect(ticket.customerPubkey).toBe('pk-customer')
    expect(ticket.agentPubkey).toBe('pk-agent')
    expect(ticket.status).toBe('open')
    expect(ticket.priority).toBe('high')
    expect(ticket.category).toBe('technical')
    expect(ticket.title).toBe('outage')
    expect(ticket.body).toBe('site is down')

    expect(nrec.publish).toHaveLength(1)
    const { event, targetRelays } = nrec.publish[0]!
    expect(event.kind).toBe(7700)
    expect(targetRelays).toEqual(['wss://agent.example'])

    const tagMap = Object.fromEntries(event.tags.map((t) => [t[0], t[1]]))
    expect(tagMap['ticket_id']).toBe(ticket.id.toString())
    expect(tagMap['status']).toBe('open')
    expect(tagMap['priority']).toBe('high')
    expect(tagMap['category']).toBe('technical')
    expect(tagMap['p']).toBe('pk-agent')

    expect(crec.encrypt).toHaveLength(1)
    expect(crec.encrypt[0]!.recipient).toBe('pk-agent')
    const payload = JSON.parse(crec.encrypt[0]!.plaintext)
    expect(payload).toEqual({
      ticket_id: ticket.id.toString(),
      title: 'outage',
      body: 'site is down',
    })
    expect(event.content).toBe(`enc(pk-agent):${crec.encrypt[0]!.plaintext}`)

    expect(ticket.eventId).toBe('id-1')
  })

  test('emits ticket:created on event bus', async () => {
    const { port: nostrEvent } = makeNostrEvent()
    const { port: crypto } = makeCrypto()
    const { port: keyProvider } = makeKeyProvider({ pubkey: 'pk-customer' })
    const { port: eventBus, rec: erec } = makeEventBus()
    const discovery = makeRelayDiscovery({
      publishRelaysByPubkey: { 'pk-agent': ['wss://r.example'] },
    })

    const uc = new CreateTicketUseCase(nostrEvent, crypto, keyProvider, discovery, eventBus)
    const ticket = await uc.execute(PARAMS)

    expect(erec.events).toHaveLength(1)
    expect(erec.events[0]).toEqual({ type: 'ticket:created', payload: ticket })
  })

  test('falls back to bootstrap relays when agent NIP-65 missing', async () => {
    const { port: nostrEvent, rec: nrec } = makeNostrEvent()
    const { port: crypto } = makeCrypto()
    const { port: keyProvider } = makeKeyProvider({ pubkey: 'pk-customer' })
    const { port: eventBus } = makeEventBus()
    const discovery = makeRelayDiscovery({
      bootstrap: ['wss://boot.example'],
      // agent has no NIP-65 entry → service falls back
    })

    const uc = new CreateTicketUseCase(nostrEvent, crypto, keyProvider, discovery, eventBus)
    await uc.execute(PARAMS)

    expect(nrec.publish[0]!.targetRelays).toEqual(['wss://boot.example'])
  })
})
