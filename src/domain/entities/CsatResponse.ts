import type { TicketId } from '../value-objects/TicketId.js'

export interface CsatResponse {
  ticketId: TicketId
  threadRoot: string
  rating: 1 | 2 | 3 | 4 | 5
  comment: string
  byPubkey: string
  at: number
}
