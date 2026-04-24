import type { TicketId } from '../value-objects/TicketId.js'

export interface TicketReply {
  ticketId: TicketId
  threadRoot: string
  byPubkey: string
  body: string
  at: number
}
