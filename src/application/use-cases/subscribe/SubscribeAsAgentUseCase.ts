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
import type { Priority } from '../../../domain/value-objects/Priority.js'
import type { Category } from '../../../domain/value-objects/Category.js'
import { Ticket } from '../../../domain/entities/Ticket.js'
import { Message } from '../../../domain/entities/Message.js'

export class SubscribeAsAgentUseCase {
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
        { kinds: [7700, 7703, 7704], '#p': [me] },
        (ev): void => {
          void this.handle(ev)
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

  private async handle(ev: SignedEvent): Promise<void> {
    const ticketIdStr = ev.tags.find((t) => t[0] === 'ticket_id')?.[1]
    if (!ticketIdStr) return
    const ticketId = TicketId.fromString(ticketIdStr)

    if (ev.kind === 7700) {
      const plain = await this.crypto.decrypt(ev.content, ev.pubkey)
      const body = JSON.parse(plain) as { ticket_id: string; title: string; body: string }
      if (body.ticket_id !== ticketIdStr) return

      const priority = ev.tags.find((t) => t[0] === 'priority')?.[1] as Priority
      const category = ev.tags.find((t) => t[0] === 'category')?.[1] as Category
      const ticket = new Ticket(
        ticketId,
        ev.id,
        ev.pubkey,
        await this.keyProvider.getPubkey(),
        'open',
        priority,
        category,
        body.title,
        body.body,
        ev.created_at,
      )
      this.eventBus.emit({ type: 'ticket:created', payload: ticket })
    } else if (ev.kind === 7703) {
      const threadRoot = ev.tags.find((t) => t[0] === 'e')?.[1]
      if (!threadRoot) return
      const plain = await this.crypto.decrypt(ev.content, ev.pubkey)
      const body = JSON.parse(plain).body as string
      this.eventBus.emit({
        type: 'ticket:note',
        payload: { ticketId, threadRoot, body, byPubkey: ev.pubkey, at: ev.created_at },
      })
    } else if (ev.kind === 7704) {
      const threadRoot = ev.tags.find((t) => t[0] === 'e')?.[1]
      const rating = Number(ev.tags.find((t) => t[0] === 'rating')?.[1] ?? 0)
      if (!threadRoot || rating < 1 || rating > 5) return
      this.eventBus.emit({
        type: 'csat:submitted',
        payload: {
          ticketId,
          threadRoot,
          rating: rating as 1 | 2 | 3 | 4 | 5,
          comment: ev.content,
          byPubkey: ev.pubkey,
          at: ev.created_at,
        },
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
      /* not for me */
    }
  }

  stop(): void {
    for (const s of this.subs) s.close()
    this.subs = []
  }
}
