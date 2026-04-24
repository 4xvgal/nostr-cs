import { describe, test, expect } from 'bun:test'
import { SubscribeAsAgentUseCase } from '../../../../src/application/use-cases/subscribe/SubscribeAsAgentUseCase.js'
import { TicketId } from '../../../../src/domain/value-objects/TicketId.js'
import { Ticket } from '../../../../src/domain/entities/Ticket.js'
import type { SignedEvent } from '../../../../src/application/ports/outbound/NostrEventPort.js'
import {
  makeNostrEvent,
  makeCrypto,
  makeKeyProvider,
  makeEventBus,
} from '../../../support/mocks.js'

const ME = 'pk-agent'

const CONFIG = {
  bootstrap: ['wss://boot.example'],
  write: [],
  read: ['wss://read.example'],
  dm: ['wss://dm.example'],
}

const flush = () => new Promise((r) => setTimeout(r, 0))

function build(
  overrides: Parameters<typeof makeCrypto>[0] = {},
) {
  const ne = makeNostrEvent()
  const cr = makeCrypto(overrides)
  const kp = makeKeyProvider({ pubkey: ME })
  const eb = makeEventBus()
  const uc = new SubscribeAsAgentUseCase(ne.port, cr.port, kp.port, CONFIG, eb.port)
  return { uc, ne, cr, kp, eb }
}

function mkEvent(partial: Partial<SignedEvent> & { kind: number }): SignedEvent {
  return {
    id: 'ev-id',
    pubkey: 'pk-customer',
    tags: [],
    content: '',
    created_at: 1_700_000_000,
    sig: 'sig',
    ...partial,
  }
}

describe('SubscribeAsAgentUseCase', () => {
  test('execute() registers 2 subscriptions with the right kinds', async () => {
    const { uc, ne } = build()
    await uc.execute()
    expect(ne.rec.subscribe[0]!.filter.kinds).toEqual([7700, 7703, 7704])
    expect(ne.rec.subscribe[1]!.filter.kinds).toEqual([1059])
  })

  test('kind 7700 → emits ticket:created with Ticket entity', async () => {
    const tid = TicketId.generate()
    const { uc, ne, eb } = build({
      decryptResult: () =>
        JSON.stringify({ ticket_id: tid.toString(), title: 't', body: 'b' }),
    })
    await uc.execute()

    ne.rec.subscribe[0]!.onEvent(
      mkEvent({
        kind: 7700,
        id: 'ticket-event-id',
        pubkey: 'pk-customer',
        tags: [
          ['ticket_id', tid.toString()],
          ['status', 'open'],
          ['priority', 'high'],
          ['category', 'technical'],
          ['p', ME],
        ],
        content: 'cipher',
      }),
    )
    await flush()

    expect(eb.rec.events).toHaveLength(1)
    const ev = eb.rec.events[0]!
    expect(ev.type).toBe('ticket:created')
    if (ev.type === 'ticket:created') {
      expect(ev.payload).toBeInstanceOf(Ticket)
      expect(ev.payload.eventId).toBe('ticket-event-id')
      expect(ev.payload.customerPubkey).toBe('pk-customer')
      expect(ev.payload.agentPubkey).toBe(ME)
      expect(ev.payload.priority).toBe('high')
      expect(ev.payload.category).toBe('technical')
      expect(ev.payload.title).toBe('t')
      expect(ev.payload.body).toBe('b')
    }
  })

  test('kind 7700 with mismatched ticket_id in body → dropped (integrity check)', async () => {
    const tid = TicketId.generate()
    const other = TicketId.generate()
    const { uc, ne, eb } = build({
      decryptResult: () =>
        JSON.stringify({ ticket_id: other.toString(), title: 't', body: 'b' }),
    })
    await uc.execute()

    ne.rec.subscribe[0]!.onEvent(
      mkEvent({
        kind: 7700,
        tags: [
          ['ticket_id', tid.toString()],
          ['priority', 'normal'],
          ['category', 'general'],
          ['p', ME],
        ],
      }),
    )
    await flush()

    expect(eb.rec.events).toHaveLength(0)
  })

  test('kind 7703 → emits ticket:note with decrypted body', async () => {
    const tid = TicketId.generate()
    const { uc, ne, eb } = build({
      decryptResult: () => JSON.stringify({ body: 'heads up' }),
    })
    await uc.execute()

    ne.rec.subscribe[0]!.onEvent(
      mkEvent({
        kind: 7703,
        pubkey: 'pk-peer-agent',
        tags: [
          ['e', 'root'],
          ['ticket_id', tid.toString()],
          ['p', ME],
        ],
        content: 'cipher',
      }),
    )
    await flush()

    expect(eb.rec.events).toHaveLength(1)
    const ev = eb.rec.events[0]!
    expect(ev.type).toBe('ticket:note')
    if (ev.type === 'ticket:note') {
      expect(ev.payload.body).toBe('heads up')
      expect(ev.payload.byPubkey).toBe('pk-peer-agent')
      expect(ev.payload.threadRoot).toBe('root')
    }
  })

  test('kind 7704 with valid rating → emits csat:submitted', async () => {
    const tid = TicketId.generate()
    const { uc, ne, eb } = build()
    await uc.execute()

    ne.rec.subscribe[0]!.onEvent(
      mkEvent({
        kind: 7704,
        pubkey: 'pk-customer',
        tags: [
          ['e', 'root'],
          ['ticket_id', tid.toString()],
          ['p', ME],
          ['rating', '5'],
        ],
        content: 'nice work',
      }),
    )
    await flush()

    expect(eb.rec.events).toHaveLength(1)
    const ev = eb.rec.events[0]!
    expect(ev.type).toBe('csat:submitted')
    if (ev.type === 'csat:submitted') {
      expect(ev.payload.rating).toBe(5)
      expect(ev.payload.comment).toBe('nice work')
    }
  })

  test('kind 7704 with rating out of range → dropped', async () => {
    const tid = TicketId.generate()
    const { uc, ne, eb } = build()
    await uc.execute()

    ne.rec.subscribe[0]!.onEvent(
      mkEvent({
        kind: 7704,
        tags: [
          ['e', 'root'],
          ['ticket_id', tid.toString()],
          ['rating', '7'],
        ],
      }),
    )
    await flush()

    expect(eb.rec.events).toHaveLength(0)
  })

  test('gift wrap → emits message:received with channel "dm"', async () => {
    const tid = TicketId.generate()
    const { uc, ne, eb } = build({
      unsealResult: () => ({
        kind: 14,
        pubkey: 'pk-customer',
        tags: [
          ['e', 'root'],
          ['ticket_id', tid.toString()],
        ],
        content: 'question',
        created_at: 1_700_000_000,
      }),
    })
    await uc.execute()

    ne.rec.subscribe[1]!.onEvent(mkEvent({ kind: 1059 }))
    await flush()

    expect(eb.rec.events).toHaveLength(1)
    const ev = eb.rec.events[0]!
    if (ev.type === 'message:received') {
      expect(ev.payload.channel).toBe('dm')
      expect(ev.payload.body).toBe('question')
    }
  })

  test('stop() closes all subscriptions', async () => {
    const { uc, ne } = build()
    await uc.execute()
    uc.stop()
    expect(ne.rec.closes).toBe(2)
  })
})
