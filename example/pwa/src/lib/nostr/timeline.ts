import type { Ticket, Message, TicketReply, StatusUpdate } from 'nostr-cs'

export type TimelineEntry =
  | { kind: 'ticket'; at: number; ticket: Ticket }
  | { kind: 'reply'; at: number; reply: TicketReply }
  | { kind: 'note'; at: number; note: TicketReply }
  | { kind: 'message'; at: number; message: Message }
  | { kind: 'status'; at: number; status: StatusUpdate }

export function buildTimeline(args: {
  ticket: Ticket | undefined
  replies: TicketReply[] | undefined
  notes: TicketReply[] | undefined
  messages: Message[] | undefined
  statuses: StatusUpdate[] | undefined
  showNotes: boolean
}): TimelineEntry[] {
  const out: TimelineEntry[] = []
  if (args.ticket) out.push({ kind: 'ticket', at: args.ticket.createdAt, ticket: args.ticket })
  for (const r of args.replies ?? []) out.push({ kind: 'reply', at: r.at, reply: r })
  if (args.showNotes) for (const n of args.notes ?? []) out.push({ kind: 'note', at: n.at, note: n })
  // The framework emits both `ticket:reply` and `message:received` (channel='reply')
  // for every 7702. Replies are already rendered above, so skip the reply-channel
  // mirror here — only DMs (channel='dm') come through as messages.
  for (const m of args.messages ?? []) {
    if (m.channel === 'reply') continue
    out.push({ kind: 'message', at: m.createdAt, message: m })
  }
  for (const s of args.statuses ?? []) out.push({ kind: 'status', at: s.at, status: s })
  return out.sort((a, b) => a.at - b.at)
}
