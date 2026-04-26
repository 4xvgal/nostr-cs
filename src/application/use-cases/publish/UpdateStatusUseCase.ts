import type { NostrEventPort, UnsignedEvent } from '../../ports/outbound/NostrEventPort.js'
import type { RelayDiscoveryService } from '../../services/RelayDiscoveryService.js'
import type { UpdateStatusParams } from '../../ports/inbound/AgentPort.js'

export class UpdateStatusUseCase {
  constructor(
    private readonly nostrEvent: NostrEventPort,
    private readonly relayDiscovery: RelayDiscoveryService,
  ) {}

  async execute(p: UpdateStatusParams): Promise<void> {
    const targetRelays = await this.relayDiscovery.getPublishRelays(p.customerPubkey)
    const raw: UnsignedEvent = {
      kind: 7701,
      tags: [
        ['e', p.threadRoot],
        ['ticket_id', p.ticketId.toString()],
        ['status', p.newStatus],
        ['p', p.customerPubkey],
      ],
      content: '',
      created_at: Math.floor(Date.now() / 1000),
    }

    await this.nostrEvent.publish(raw, targetRelays)
  }
}
