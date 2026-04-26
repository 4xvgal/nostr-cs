import type { NostrEventPort, UnsignedEvent } from '../../ports/outbound/NostrEventPort.js'
import type { CryptoPort } from '../../ports/outbound/CryptoPort.js'
import type { RelayDiscoveryService } from '../../../domain/services/RelayDiscoveryService.js'
import type { InternalNoteParams } from '../../ports/inbound/AgentPort.js'

export class InternalNoteUseCase {
  constructor(
    private readonly nostrEvent: NostrEventPort,
    private readonly crypto: CryptoPort,
    private readonly relayDiscovery: RelayDiscoveryService,
  ) {}

  async execute(p: InternalNoteParams): Promise<void> {
    await Promise.all(
      p.otherAgentPubkeys.map(async (agentPk) => {
        const targetRelays = await this.relayDiscovery.getPublishRelays(agentPk)
        const encrypted = await this.crypto.encrypt(
          JSON.stringify({ ticket_id: p.ticketId.toString(), body: p.body }),
          agentPk,
        )
        const raw: UnsignedEvent = {
          kind: 7703,
          tags: [
            ['e', p.threadRoot],
            ['ticket_id', p.ticketId.toString()],
            ['p', agentPk],
          ],
          content: encrypted,
          created_at: Math.floor(Date.now() / 1000),
        }
        await this.nostrEvent.publish(raw, targetRelays)
      }),
    )
  }
}
