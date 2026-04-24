import type { NostrEventPort, UnsignedEvent } from '../../ports/outbound/NostrEventPort.js'
import type { KeyProvider } from '../../ports/outbound/KeyProvider.js'
import type { RelayDiscoveryService } from '../../../domain/services/RelayDiscoveryService.js'
import type { UpdateStatusParams } from '../../ports/inbound/AgentPort.js'

export class UpdateStatusUseCase {
  constructor(
    private readonly nostrEvent: NostrEventPort,
    private readonly keyProvider: KeyProvider,
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

    if (this.keyProvider.signAndPublish) {
      await this.keyProvider.signAndPublish(raw, targetRelays)
    } else {
      await this.nostrEvent.publish(raw, targetRelays)
    }
  }
}
