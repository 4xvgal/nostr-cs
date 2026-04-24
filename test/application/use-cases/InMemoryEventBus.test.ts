import { describe, test, expect } from 'bun:test'
import { InMemoryEventBus } from '../../../src/infrastructure/adapters/outbound/InMemoryEventBus.js'
import { Ticket } from '../../../src/domain/entities/Ticket.js'
import { TicketId } from '../../../src/domain/value-objects/TicketId.js'

function makeTicket(): Ticket {
  return new Ticket(
    TicketId.generate(),
    'event-id',
    'pk-c',
    'pk-a',
    'open',
    'normal',
    'general',
    't',
    'b',
    Math.floor(Date.now() / 1000),
  )
}

describe('InMemoryEventBus', () => {
  test('dispatches events only to handlers registered for that type', () => {
    const bus = new InMemoryEventBus()
    const ticketCalls: Ticket[] = []
    const statusCalls: unknown[] = []
    bus.on('ticket:created', (p) => ticketCalls.push(p))
    bus.on('status:changed', (p) => statusCalls.push(p))

    const ticket = makeTicket()
    bus.emit({ type: 'ticket:created', payload: ticket })

    expect(ticketCalls).toEqual([ticket])
    expect(statusCalls).toEqual([])
  })

  test('emits to every handler when multiple are registered', () => {
    const bus = new InMemoryEventBus()
    let a = 0
    let b = 0
    bus.on('ticket:created', () => a++)
    bus.on('ticket:created', () => b++)

    bus.emit({ type: 'ticket:created', payload: makeTicket() })
    expect(a).toBe(1)
    expect(b).toBe(1)
  })

  test('no handlers registered → emit is a no-op', () => {
    const bus = new InMemoryEventBus()
    expect(() =>
      bus.emit({ type: 'ticket:created', payload: makeTicket() }),
    ).not.toThrow()
  })

  test('unsubscribe function stops that handler without affecting others', () => {
    const bus = new InMemoryEventBus()
    let a = 0
    let b = 0
    const off = bus.on('ticket:created', () => a++)
    bus.on('ticket:created', () => b++)

    off()
    bus.emit({ type: 'ticket:created', payload: makeTicket() })
    expect(a).toBe(0)
    expect(b).toBe(1)
  })

  test('unsubscribe is idempotent', () => {
    const bus = new InMemoryEventBus()
    let calls = 0
    const off = bus.on('ticket:created', () => calls++)
    off()
    off()
    bus.emit({ type: 'ticket:created', payload: makeTicket() })
    expect(calls).toBe(0)
  })
})
