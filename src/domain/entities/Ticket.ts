import type { TicketId } from '../value-objects/TicketId.js'
import type { TicketStatus } from '../value-objects/TicketStatus.js'
import type { Priority } from '../value-objects/Priority.js'
import type { Category } from '../value-objects/Category.js'

export class Ticket {
  constructor(
    readonly id: TicketId,
    readonly eventId: string,
    readonly customerPubkey: string,
    readonly agentPubkey: string,
    readonly status: TicketStatus,
    readonly priority: Priority,
    readonly category: Category,
    readonly title: string,
    readonly body: string,
    readonly createdAt: number,
  ) {}
}
