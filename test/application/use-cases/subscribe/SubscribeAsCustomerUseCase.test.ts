import { describe, test, expect } from 'bun:test'
import { SubscribeAsCustomerUseCase } from '../../../../src/application/use-cases/subscribe/SubscribeAsCustomerUseCase.js'
import { TicketId } from '../../../../src/domain/value-objects/TicketId.js'
import { Message } from '../../../../src/domain/entities/Message.js'
import type { SignedEvent } from '../../../../src/application/ports/outbound/NostrEventPort.js'
import {
  makeNostrEvent,
  makeCrypto,
  makeKeyProvider,
  makeEventBus,
} from '../../../support/mocks.js'

const ME = 'pk-me'

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
  const uc = new SubscribeAsCustomerUseCase(ne.port, cr.port, kp.port, CONFIG, eb.port)
  return { uc, ne, cr, kp, eb }
}

function mkEvent(partial: Partial<SignedEvent> & { kind: number }): SignedEvent {
  return {
    id: 'id',
    pubkey: 'pk-agent',
    tags: [],
    content: '',
    created_at: 1_700_000_000,
    sig: 'sig',
    ...partial,
  }
}

describe('SubscribeAsCustomerUseCase', () => {
  test('execute() registers 2 subscriptions with correct filters and relays', async () => {
    const { uc, ne } = build()
    await uc.execute()

    expect(ne.rec.subscribe).toHaveLength(2)

    const [ticketSub, dmSub] = ne.rec.subscribe
    expect(ticketSub!.filter.kinds).toEqual([7701, 7702])
    expect(ticketSub!.filter['#p']).toEqual([ME])
    expect(ticketSub!.relays).toEqual(['wss://read.example'])

    expect(dmSub!.filter.kinds).toEqual([1059])
    expect(dmSub!.filter['#p']).toEqual([ME])
    expect(dmSub!.relays).toEqual(['wss://dm.example'])
  })

  test('kind 7701 → emits status:changed', async () => {
    const { uc, ne, eb } = build()
    await uc.execute()
    const tid = TicketId.generate()

    ne.rec.subscribe[0]!.onEvent(
      mkEvent({
        kind: 7701,
        tags: [
          ['e', 'root-id'],
          ['ticket_id', tid.toString()],
          ['status', 'resolved'],
          ['p', ME],
        ],
      }),
    )
    await flush()

    expect(eb.rec.events).toHaveLength(1)
    expect(eb.rec.events[0]!.type).toBe('status:changed')
    if (eb.rec.events[0]!.type === 'status:changed') {
      expect(eb.rec.events[0]!.payload.newStatus).toBe('resolved')
      expect(eb.rec.events[0]!.payload.threadRoot).toBe('root-id')
      expect(eb.rec.events[0]!.payload.ticketId.toString()).toBe(tid.toString())
    }
  })

  test('kind 7702 → emits ticket:reply + message:received', async () => {
    const { uc, ne, eb } = build({
      decryptResult: () => JSON.stringify({ body: 'thanks' }),
    })
    await uc.execute()
    const tid = TicketId.generate()

    ne.rec.subscribe[0]!.onEvent(
      mkEvent({
        kind: 7702,
        tags: [
          ['e', 'root'],
          ['ticket_id', tid.toString()],
          ['p', ME],
        ],
        content: 'cipher',
      }),
    )
    await flush()

    const types = eb.rec.events.map((e) => e.type)
    expect(types).toEqual(['ticket:reply', 'message:received'])
    const reply = eb.rec.events[0]!
    if (reply.type === 'ticket:reply') expect(reply.payload.body).toBe('thanks')
    const msg = eb.rec.events[1]!
    if (msg.type === 'message:received') {
      expect(msg.payload).toBeInstanceOf(Message)
      expect(msg.payload.channel).toBe('reply')
      expect(msg.payload.body).toBe('thanks')
    }
  })

  test('drops ticket event missing ticket_id or e tag', async () => {
    const { uc, ne, eb } = build()
    await uc.execute()

    ne.rec.subscribe[0]!.onEvent(mkEvent({ kind: 7702, tags: [['e', 'r']] }))
    await flush()
    ne.rec.subscribe[0]!.onEvent(mkEvent({ kind: 7701, tags: [['ticket_id', TicketId.generate().toString()]] }))
    await flush()

    expect(eb.rec.events).toHaveLength(0)
  })

  test('gift wrap (kind 1059) → emits message:received with channel "dm"', async () => {
    const tid = TicketId.generate()
    const { uc, ne, eb } = build({
      unsealResult: () => ({
        kind: 14,
        pubkey: 'pk-sender',
        tags: [
          ['e', 'root'],
          ['ticket_id', tid.toString()],
        ],
        content: 'hello',
        created_at: 1_700_000_000,
      }),
    })
    await uc.execute()

    ne.rec.subscribe[1]!.onEvent(mkEvent({ kind: 1059 }))
    await flush()

    expect(eb.rec.events).toHaveLength(1)
    const ev = eb.rec.events[0]!
    expect(ev.type).toBe('message:received')
    if (ev.type === 'message:received') {
      expect(ev.payload.channel).toBe('dm')
      expect(ev.payload.body).toBe('hello')
      expect(ev.payload.senderPubkey).toBe('pk-sender')
    }
  })

  test('gift wrap that fails to decrypt is silently dropped', async () => {
    const { uc, ne, eb } = build({
      unsealResult: () => {
        throw new Error('wrong recipient')
      },
    })
    await uc.execute()

    ne.rec.subscribe[1]!.onEvent(mkEvent({ kind: 1059 }))
    await flush()

    expect(eb.rec.events).toHaveLength(0)
  })

  test('stop() closes every subscription', async () => {
    const { uc, ne } = build()
    await uc.execute()
    uc.stop()
    expect(ne.rec.closes).toBe(2)

    // stop() is idempotent — subsequent calls do not close fresh handles.
    uc.stop()
    expect(ne.rec.closes).toBe(2)
  })
})
