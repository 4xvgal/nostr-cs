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
import type { Priority } from '../../../domain/value-objects/Priority.js'
import type { Category } from '../../../domain/value-objects/Category.js'
import { Ticket } from '../../../domain/entities/Ticket.js'
import { Message } from '../../../domain/entities/Message.js'

/**
 * Pull events the user *authored*.
 *
 * The role's regular subscription filters by `#p:[me]`, so events the user
 * sent (where they are the author, and `#p` points at the recipient) never
 * come back. On a fresh device with no local cache, this is what re-populates
 * the user's own ticket creates / replies / status updates / notes.
 *
 * NIP-17 gift-wrapped DMs (kind 1059) sent by the user can NOT be pulled —
 * they are addressed to the recipient and the sender cannot decrypt the wrap.
 * Senders must rely on local cache for their outgoing DM history.
 */
export class PullOwnHistoryUseCase {
  constructor(
    private readonly nostrEvent: NostrEventPort,
    private readonly crypto: CryptoPort,
    private readonly keyProvider: KeyProvider,
    private readonly relayConfig: ResolvedRelayConfig,
    private readonly eventBus: EventBusPort,
  ) {}

  async execute(role: 'agent' | 'customer', windowMs = 5000): Promise<void> {
    const me = await this.keyProvider.getPubkey()
    const kinds = role === 'customer' ? [7700] : [7701, 7702, 7703]

    const subs: Subscription[] = []
    const onEvent = (ev: SignedEvent): void => {
      void this.dispatch(ev, me)
    }
    subs.push(
      this.nostrEvent.subscribe(
        { kinds, authors: [me] },
        onEvent,
        { relays: this.relayConfig.read },
      ),
    )

    await new Promise<void>((resolve) => setTimeout(resolve, windowMs))
    for (const s of subs) s.close()
  }

  private async dispatch(ev: SignedEvent, me: string): Promise<void> {
    const ticketIdStr = ev.tags.find((t) => t[0] === 'ticket_id')?.[1]
    if (!ticketIdStr) return
    const ticketId = TicketId.fromString(ticketIdStr)

    if (ev.kind === 7700) {
      const agentPubkey = ev.tags.find((t) => t[0] === 'p')?.[1]
      if (!agentPubkey) return
      // NIP-44 conversation key is symmetric; sender can decrypt by passing
      // the recipient (here: the agent) as the conversation peer.
      const plain = await this.crypto.decrypt(ev.content, agentPubkey)
      const body = JSON.parse(plain) as { ticket_id: string; title: string; body: string }
      if (body.ticket_id !== ticketIdStr) return
      const priority = ev.tags.find((t) => t[0] === 'priority')?.[1] as Priority
      const category = ev.tags.find((t) => t[0] === 'category')?.[1] as Category
      const ticket = new Ticket(
        ticketId,
        ev.id,
        me,
        agentPubkey,
        'open',
        priority,
        category,
        body.title,
        body.body,
        ev.created_at,
      )
      this.eventBus.emit({ type: 'ticket:created', payload: ticket })
    } else if (ev.kind === 7701) {
      const threadRoot = ev.tags.find((t) => t[0] === 'e')?.[1]
      const newStatus = ev.tags.find((t) => t[0] === 'status')?.[1] as TicketStatus | undefined
      if (!threadRoot || !newStatus) return
      this.eventBus.emit({
        type: 'status:changed',
        payload: { ticketId, threadRoot, newStatus, byPubkey: me, at: ev.created_at },
      })
    } else if (ev.kind === 7702) {
      const threadRoot = ev.tags.find((t) => t[0] === 'e')?.[1]
      const customerPubkey = ev.tags.find((t) => t[0] === 'p')?.[1]
      if (!threadRoot || !customerPubkey) return
      const plain = await this.crypto.decrypt(ev.content, customerPubkey)
      const body = JSON.parse(plain).body as string
      this.eventBus.emit({
        type: 'ticket:reply',
        payload: { ticketId, threadRoot, body, byPubkey: me, at: ev.created_at },
      })
      this.eventBus.emit({
        type: 'message:received',
        payload: new Message(ticketId, threadRoot, me, body, ev.created_at, 'reply'),
      })
    } else if (ev.kind === 7703) {
      const threadRoot = ev.tags.find((t) => t[0] === 'e')?.[1]
      const otherAgentPubkey = ev.tags.find((t) => t[0] === 'p')?.[1]
      if (!threadRoot || !otherAgentPubkey) return
      const plain = await this.crypto.decrypt(ev.content, otherAgentPubkey)
      const body = JSON.parse(plain).body as string
      this.eventBus.emit({
        type: 'ticket:note',
        payload: { ticketId, threadRoot, body, byPubkey: me, at: ev.created_at },
      })
    }
  }
}
