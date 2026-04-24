import type { Ticket } from '../../../domain/entities/Ticket.js'
import type { Message } from '../../../domain/entities/Message.js'
import type { TicketReply } from '../../../domain/entities/TicketReply.js'
import type { StatusUpdate } from '../../../domain/entities/StatusUpdate.js'
import type { CsatResponse } from '../../../domain/entities/CsatResponse.js'

export type CSEvent =
  | { type: 'ticket:created'; payload: Ticket }
  | { type: 'ticket:reply'; payload: TicketReply }
  | { type: 'ticket:note'; payload: TicketReply }
  | { type: 'status:changed'; payload: StatusUpdate }
  | { type: 'message:received'; payload: Message }
  | { type: 'csat:submitted'; payload: CsatResponse }

export interface EventBusPort {
  emit(event: CSEvent): void
  on<T extends CSEvent['type']>(
    type: T,
    handler: (payload: Extract<CSEvent, { type: T }>['payload']) => void,
  ): () => void
}
