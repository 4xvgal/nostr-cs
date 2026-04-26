import type { NostrEventPort, UnsignedEvent } from '../../ports/outbound/NostrEventPort.js'
import type { CryptoPort } from '../../ports/outbound/CryptoPort.js'
import type { RelayDiscoveryService } from '../../services/RelayDiscoveryService.js'
import type { SubmitCsatParams } from '../../ports/inbound/CustomerPort.js'

export class SubmitCsatUseCase {
  constructor(
    private readonly nostrEvent: NostrEventPort,
    private readonly crypto: CryptoPort,
    private readonly relayDiscovery: RelayDiscoveryService,
  ) {}

  async execute(p: SubmitCsatParams): Promise<void> {
    const targetRelays = await this.relayDiscovery.getPublishRelays(p.agentPubkey)
    const encrypted = await this.crypto.encrypt(
      JSON.stringify({ rating: p.rating, comment: p.comment }),
      p.agentPubkey,
    )
    const raw: UnsignedEvent = {
      kind: 7704,
      tags: [
        ['e', p.threadRoot],
        ['ticket_id', p.ticketId.toString()],
        ['p', p.agentPubkey],
      ],
      content: encrypted,
      created_at: Math.floor(Date.now() / 1000),
    }
    await this.nostrEvent.publish(raw, targetRelays)
  }
}
