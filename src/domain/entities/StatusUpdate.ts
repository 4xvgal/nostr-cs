import type { TicketId } from '../value-objects/TicketId.js'
import type { TicketStatus } from '../value-objects/TicketStatus.js'

export interface StatusUpdate {
  ticketId: TicketId
  threadRoot: string
  newStatus: TicketStatus
  byPubkey: string
  at: number
}
