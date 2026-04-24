import type { TicketId } from '../../../domain/value-objects/TicketId.js'
import type { TicketStatus } from '../../../domain/value-objects/TicketStatus.js'
import type { SendMessageParams } from './CustomerPort.js'

export interface ReplyParams {
  ticketId: TicketId
  threadRoot: string
  body: string
  customerPubkey: string
}

export interface UpdateStatusParams {
  ticketId: TicketId
  threadRoot: string
  newStatus: TicketStatus
  customerPubkey: string
}

export interface InternalNoteParams {
  ticketId: TicketId
  threadRoot: string
  body: string
  otherAgentPubkeys: string[]
}

export type { SendMessageParams }

export interface AgentPort {
  replyTicket(params: ReplyParams): Promise<void>
  updateStatus(params: UpdateStatusParams): Promise<void>
  addInternalNote(params: InternalNoteParams): Promise<void>
  sendMessage(params: SendMessageParams): Promise<void>
}
