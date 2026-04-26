import { derived, writable } from 'svelte/store'
import { Message, type Ticket, type TicketReply, type StatusUpdate, type CsatResponse, type TicketStatus, type TicketId } from 'nostr-cs'

export const tickets = writable<Map<string, Ticket>>(new Map())
export const replies = writable<Map<string, TicketReply[]>>(new Map())
export const notes = writable<Map<string, TicketReply[]>>(new Map())
export const messages = writable<Map<string, Message[]>>(new Map())
export const statusEvents = writable<Map<string, StatusUpdate[]>>(new Map())
export const csats = writable<Map<string, CsatResponse>>(new Map())

/** First-wins: ignore duplicate receipts of an already-known ticket. */
export function upsertTicket(t: Ticket): void {
  tickets.update((m) => {
    if (m.has(t.id.toString())) return m
    const next = new Map(m)
    next.set(t.id.toString(), t)
    return next
  })
}

export function pushReply(r: TicketReply): void {
  replies.update((m) => {
    const next = new Map(m)
    const list = next.get(r.threadRoot) ?? []
    if (list.some((x) => x.byPubkey === r.byPubkey && x.at === r.at && x.body === r.body)) return next
    next.set(r.threadRoot, [...list, r].sort((a, b) => a.at - b.at))
    return next
  })
}

export function pushNote(n: TicketReply): void {
  notes.update((m) => {
    const next = new Map(m)
    const list = next.get(n.threadRoot) ?? []
    if (list.some((x) => x.byPubkey === n.byPubkey && x.at === n.at && x.body === n.body)) return next
    next.set(n.threadRoot, [...list, n].sort((a, b) => a.at - b.at))
    return next
  })
}

export function pushMessage(msg: Message): void {
  messages.update((m) => {
    const next = new Map(m)
    const list = next.get(msg.threadRoot) ?? []
    if (
      list.some(
        (x) =>
          x.senderPubkey === msg.senderPubkey &&
          x.createdAt === msg.createdAt &&
          x.body === msg.body,
      )
    )
      return next
    next.set(msg.threadRoot, [...list, msg].sort((a, b) => a.createdAt - b.createdAt))
    return next
  })
}

export function pushStatus(s: StatusUpdate): void {
  statusEvents.update((m) => {
    const next = new Map(m)
    const list = next.get(s.threadRoot) ?? []
    if (list.some((x) => x.byPubkey === s.byPubkey && x.at === s.at && x.newStatus === s.newStatus))
      return next
    next.set(s.threadRoot, [...list, s].sort((a, b) => a.at - b.at))
    return next
  })
}

export function setCsat(c: CsatResponse): void {
  csats.update((m) => {
    const next = new Map(m)
    next.set(c.threadRoot, c)
    return next
  })
}

export function clearAll(): void {
  tickets.set(new Map())
  replies.set(new Map())
  notes.set(new Map())
  messages.set(new Map())
  statusEvents.set(new Map())
  csats.set(new Map())
}

// ── Optimistic publish helpers ─────────────────────────────────────────
// Sender doesn't receive their own events through their `#p:[me]` subscription
// (the events are tagged `#p` to the *recipient*), so after a successful
// publish we synthesise an entry locally so the sender sees their own action.
// First-wins dedup means the eventual relay echo (if any) is harmlessly dropped.

export function pushOptimisticReply(args: {
  ticketId: TicketId
  threadRoot: string
  body: string
  byPubkey: string
}): void {
  const at = Math.floor(Date.now() / 1000)
  pushReply({ ...args, at })
}

export function pushOptimisticNote(args: {
  ticketId: TicketId
  threadRoot: string
  body: string
  byPubkey: string
}): void {
  const at = Math.floor(Date.now() / 1000)
  pushNote({ ...args, at })
}

export function pushOptimisticStatus(args: {
  ticketId: TicketId
  threadRoot: string
  newStatus: TicketStatus
  byPubkey: string
}): void {
  const at = Math.floor(Date.now() / 1000)
  pushStatus({ ...args, at })
}

export function pushOptimisticMessage(args: {
  ticketId: TicketId
  threadRoot: string
  body: string
  senderPubkey: string
}): void {
  const at = Math.floor(Date.now() / 1000)
  pushMessage(new Message(args.ticketId, args.threadRoot, args.senderPubkey, args.body, at, 'dm'))
}

/** Latest status from all 7701 events on a thread; defaults to 'open' if none. */
export const currentStatus = derived(statusEvents, ($ev) => {
  const out = new Map<string, TicketStatus>()
  for (const [threadRoot, list] of $ev) {
    if (list.length === 0) continue
    const sorted = [...list].sort((a, b) => b.at - a.at)
    const first = sorted[0]
    if (first) out.set(threadRoot, first.newStatus)
  }
  return out
})
