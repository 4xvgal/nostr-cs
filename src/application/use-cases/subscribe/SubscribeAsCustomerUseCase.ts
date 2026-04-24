import type {
  NostrEventPort,
  SignedEvent,
  Subscription,
} from '../../ports/outbound/NostrEventPort.js'
import type { CryptoPort } from '../../ports/outbound/CryptoPort.js'
import type { KeyProvider } from '../../ports/outbound/KeyProvider.js'
import type { EventBusPort } from '../../ports/outbound/EventBusPort.js'
import type { ResolvedRelayConfig } from '../../config/ResolvedRelayConfig.js'
import { TicketId } from '../../../domain/value-objects/TicketId.js'
import type { TicketStatus } from '../../../domain/value-objects/TicketStatus.js'
import { Message } from '../../../domain/entities/Message.js'

export class SubscribeAsCustomerUseCase {
  private subs: Subscription[] = []

  constructor(
    private readonly nostrEvent: NostrEventPort,
    private readonly crypto: CryptoPort,
    private readonly keyProvider: KeyProvider,
    private readonly relayConfig: ResolvedRelayConfig,
    private readonly eventBus: EventBusPort,
  ) {}

  async execute(): Promise<void> {
    const me = await this.keyProvider.getPubkey()

    this.subs.push(
      this.nostrEvent.subscribe(
        { kinds: [7701, 7702], '#p': [me] },
        (ev): void => {
          void this.handleTicketEvent(ev)
        },
        { relays: this.relayConfig.read },
      ),
    )

    this.subs.push(
      this.nostrEvent.subscribe(
        { kinds: [1059], '#p': [me] },
        (ev): void => {
          void this.handleGiftWrap(ev)
        },
        { relays: this.relayConfig.dm },
      ),
    )
  }

  private async handleTicketEvent(ev: SignedEvent): Promise<void> {
    const ticketIdStr = ev.tags.find((t) => t[0] === 'ticket_id')?.[1]
    const threadRoot = ev.tags.find((t) => t[0] === 'e')?.[1]
    if (!ticketIdStr || !threadRoot) return
    const ticketId = TicketId.fromString(ticketIdStr)

    if (ev.kind === 7701) {
      const newStatus = ev.tags.find((t) => t[0] === 'status')?.[1] as TicketStatus | undefined
      if (!newStatus) return
      this.eventBus.emit({
        type: 'status:changed',
        payload: {
          ticketId,
          threadRoot,
          newStatus,
          byPubkey: ev.pubkey,
          at: ev.created_at,
        },
      })
    } else if (ev.kind === 7702) {
      const plain = await this.crypto.decrypt(ev.content, ev.pubkey)
      const body = JSON.parse(plain).body as string
      this.eventBus.emit({
        type: 'ticket:reply',
        payload: { ticketId, threadRoot, body, byPubkey: ev.pubkey, at: ev.created_at },
      })
      this.eventBus.emit({
        type: 'message:received',
        payload: new Message(ticketId, threadRoot, ev.pubkey, body, ev.created_at, 'reply'),
      })
    }
  }

  private async handleGiftWrap(wrap: SignedEvent): Promise<void> {
    try {
      const rumor = await this.crypto.unwrapAndUnseal(wrap)
      const ticketIdStr = rumor.tags.find((t) => t[0] === 'ticket_id')?.[1]
      const threadRoot = rumor.tags.find((t) => t[0] === 'e')?.[1]
      if (!ticketIdStr || !threadRoot) return
      const ticketId = TicketId.fromString(ticketIdStr)
      this.eventBus.emit({
        type: 'message:received',
        payload: new Message(
          ticketId,
          threadRoot,
          rumor.pubkey,
          rumor.content,
          rumor.created_at,
          'dm',
        ),
      })
    } catch {
      /* decryption failed — not addressed to me */
    }
  }

  stop(): void {
    for (const s of this.subs) s.close()
    this.subs = []
  }
}
