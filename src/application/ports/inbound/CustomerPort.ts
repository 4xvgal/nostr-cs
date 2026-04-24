import type { TicketId } from '../../../domain/value-objects/TicketId.js'
import type { Priority } from '../../../domain/value-objects/Priority.js'
import type { Category } from '../../../domain/value-objects/Category.js'
import type { Ticket } from '../../../domain/entities/Ticket.js'

export interface CreateTicketParams {
  title: string
  body: string
  agentPubkey: string
  priority: Priority
  category: Category
}

export interface SendMessageParams {
  ticketId: TicketId
  threadRoot: string
  content: string
  recipientPubkey: string
}

export interface SubmitCsatParams {
  ticketId: TicketId
  threadRoot: string
  agentPubkey: string
  rating: 1 | 2 | 3 | 4 | 5
  comment: string
}

export interface CustomerPort {
  createTicket(params: CreateTicketParams): Promise<Ticket>
  sendMessage(params: SendMessageParams): Promise<void>
  submitCsat(params: SubmitCsatParams): Promise<void>
}
