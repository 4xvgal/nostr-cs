export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export const TicketStatus = {
  Open: 'open' as TicketStatus,
  InProgress: 'in_progress' as TicketStatus,
  Resolved: 'resolved' as TicketStatus,
  Closed: 'closed' as TicketStatus,
}
