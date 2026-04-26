import type { NostrEventPort, UnsignedEvent } from '../../ports/outbound/NostrEventPort.js'
import type { CryptoPort } from '../../ports/outbound/CryptoPort.js'
import type { KeyProvider } from '../../ports/outbound/KeyProvider.js'
import type { EventBusPort } from '../../ports/outbound/EventBusPort.js'
import type { RelayDiscoveryService } from '../../../domain/services/RelayDiscoveryService.js'
import type { CreateTicketParams } from '../../ports/inbound/CustomerPort.js'
import { Ticket } from '../../../domain/entities/Ticket.js'
import { TicketId } from '../../../domain/value-objects/TicketId.js'

export class CreateTicketUseCase {
  constructor(
    private readonly nostrEvent: NostrEventPort,
    private readonly crypto: CryptoPort,
    private readonly keyProvider: KeyProvider,
    private readonly relayDiscovery: RelayDiscoveryService,
    private readonly eventBus: EventBusPort,
  ) {}

  async execute(p: CreateTicketParams): Promise<Ticket> {
    const customer = await this.keyProvider.getPubkey()
    const ticketId = TicketId.generate()
    const targetRelays = await this.relayDiscovery.getPublishRelays(p.agentPubkey)
    const encrypted = await this.crypto.encrypt(
      JSON.stringify({
        ticket_id: ticketId.toString(),
        title: p.title,
        body: p.body,
      }),
      p.agentPubkey,
    )

    const raw: UnsignedEvent = {
      kind: 7700,
      tags: [
        ['ticket_id', ticketId.toString()],
        ['status', 'open'],
        ['priority', p.priority],
        ['category', p.category],
        ['p', p.agentPubkey],
      ],
      content: encrypted,
      created_at: Math.floor(Date.now() / 1000),
    }

    const signed = await this.nostrEvent.publish(raw, targetRelays)

    const ticket = new Ticket(
      ticketId,
      signed.id,
      customer,
      p.agentPubkey,
      'open',
      p.priority,
      p.category,
      p.title,
      p.body,
      raw.created_at,
    )
    this.eventBus.emit({ type: 'ticket:created', payload: ticket })
    return ticket
  }
}
