import type { NostrEventPort, UnsignedEvent } from '../../ports/outbound/NostrEventPort.js'
import type { CryptoPort } from '../../ports/outbound/CryptoPort.js'
import type { KeyProvider } from '../../ports/outbound/KeyProvider.js'
import type { RelayDiscoveryService } from '../../../domain/services/RelayDiscoveryService.js'
import type { ReplyParams } from '../../ports/inbound/AgentPort.js'

export class ReplyTicketUseCase {
  constructor(
    private readonly nostrEvent: NostrEventPort,
    private readonly crypto: CryptoPort,
    private readonly keyProvider: KeyProvider,
    private readonly relayDiscovery: RelayDiscoveryService,
  ) {}

  async execute(p: ReplyParams): Promise<void> {
    const targetRelays = await this.relayDiscovery.getPublishRelays(p.customerPubkey)
    const encrypted = await this.crypto.encrypt(
      JSON.stringify({ ticket_id: p.ticketId.toString(), body: p.body }),
      p.customerPubkey,
    )

    const raw: UnsignedEvent = {
      kind: 7702,
      tags: [
        ['e', p.threadRoot],
        ['ticket_id', p.ticketId.toString()],
        ['p', p.customerPubkey],
      ],
      content: encrypted,
      created_at: Math.floor(Date.now() / 1000),
    }

    if (this.keyProvider.signAndPublish) {
      await this.keyProvider.signAndPublish(raw, targetRelays)
    } else {
      await this.nostrEvent.publish(raw, targetRelays)
    }
  }
}
