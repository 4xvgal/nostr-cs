import type { NostrEventPort, UnsignedEvent } from '../../ports/outbound/NostrEventPort.js'
import type { KeyProvider } from '../../ports/outbound/KeyProvider.js'
import type { RelayDiscoveryService } from '../../../domain/services/RelayDiscoveryService.js'
import type { SubmitCsatParams } from '../../ports/inbound/CustomerPort.js'

export class SubmitCsatUseCase {
  constructor(
    private readonly nostrEvent: NostrEventPort,
    private readonly keyProvider: KeyProvider,
    private readonly relayDiscovery: RelayDiscoveryService,
  ) {}

  async execute(p: SubmitCsatParams): Promise<void> {
    const targetRelays = await this.relayDiscovery.getPublishRelays(p.agentPubkey)
    const raw: UnsignedEvent = {
      kind: 7704,
      tags: [
        ['e', p.threadRoot],
        ['ticket_id', p.ticketId.toString()],
        ['p', p.agentPubkey],
        ['rating', String(p.rating)],
      ],
      content: p.comment,
      created_at: Math.floor(Date.now() / 1000),
    }
    if (this.keyProvider.signAndPublish) {
      await this.keyProvider.signAndPublish(raw, targetRelays)
    } else {
      await this.nostrEvent.publish(raw, targetRelays)
    }
  }
}
