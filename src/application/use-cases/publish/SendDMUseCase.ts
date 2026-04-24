import type { NostrEventPort } from '../../ports/outbound/NostrEventPort.js'
import type { CryptoPort, Nip17Rumor } from '../../ports/outbound/CryptoPort.js'
import type { KeyProvider } from '../../ports/outbound/KeyProvider.js'
import type { RelayDiscoveryService } from '../../../domain/services/RelayDiscoveryService.js'
import type { SendMessageParams } from '../../ports/inbound/CustomerPort.js'

export class SendDMUseCase {
  constructor(
    private readonly nostrEvent: NostrEventPort,
    private readonly crypto: CryptoPort,
    private readonly keyProvider: KeyProvider,
    private readonly relayDiscovery: RelayDiscoveryService,
  ) {}

  async execute(p: SendMessageParams): Promise<void> {
    void this.keyProvider
    const targetRelays = await this.relayDiscovery.getDMRelays(p.recipientPubkey)

    const rumor: Nip17Rumor = {
      kind: 14,
      tags: [
        ['e', p.threadRoot],
        ['ticket_id', p.ticketId.toString()],
        ['p', p.recipientPubkey],
      ],
      content: p.content,
      created_at: Math.floor(Date.now() / 1000),
    }

    const giftWrap = await this.crypto.sealAndWrap(rumor, p.recipientPubkey)
    await this.nostrEvent.publish(giftWrap, targetRelays)
  }
}
