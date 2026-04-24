import type { TicketId } from '../value-objects/TicketId.js'

export class Message {
  constructor(
    readonly ticketId: TicketId,
    readonly threadRoot: string,
    readonly senderPubkey: string,
    readonly body: string,
    readonly createdAt: number,
    readonly channel: 'dm' | 'reply',
  ) {}
}
