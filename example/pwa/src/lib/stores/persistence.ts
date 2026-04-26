import { browser } from '$app/environment'
import { get } from 'svelte/store'
import { Ticket, Message, TicketId } from 'nostr-cs'
import type {
  TicketReply,
  StatusUpdate,
  CsatResponse,
  TicketStatus,
  Priority,
  Category,
} from 'nostr-cs'
import {
  tickets,
  replies,
  notes,
  messages,
  statusEvents,
  csats,
} from './tickets.js'
import { profiles } from './profiles.js'
import { identity } from './identity.js'

interface SerialisedTicket {
  id: string
  eventId: string
  customerPubkey: string
  agentPubkey: string
  status: TicketStatus
  priority: Priority
  category: Category
  title: string
  body: string
  createdAt: number
}

interface SerialisedTicketReply {
  ticketId: string
  threadRoot: string
  byPubkey: string
  body: string
  at: number
}

interface SerialisedStatusUpdate {
  ticketId: string
  threadRoot: string
  newStatus: TicketStatus
  byPubkey: string
  at: number
}

interface SerialisedMessage {
  ticketId: string
  threadRoot: string
  senderPubkey: string
  body: string
  createdAt: number
  channel: 'dm' | 'reply'
}

interface SerialisedCsat {
  ticketId: string
  threadRoot: string
  rating: 1 | 2 | 3 | 4 | 5
  comment: string
  byPubkey: string
  at: number
}

interface CacheShape {
  tickets: SerialisedTicket[]
  replies: Array<[string, SerialisedTicketReply[]]>
  notes: Array<[string, SerialisedTicketReply[]]>
  messages: Array<[string, SerialisedMessage[]]>
  statusEvents: Array<[string, SerialisedStatusUpdate[]]>
  csats: Array<[string, SerialisedCsat]>
  profiles: Array<[string, { name?: string; display_name?: string; picture?: string; about?: string }]>
}

function cacheKey(pubkey: string): string {
  return `nostr-cs-pwa:cache:v1:${pubkey}`
}

function serialiseTicketId(id: TicketId): string {
  return id.toString()
}

function dehydrateReply(r: TicketReply): SerialisedTicketReply {
  return { ...r, ticketId: serialiseTicketId(r.ticketId) }
}

function rehydrateReply(s: SerialisedTicketReply): TicketReply {
  return { ...s, ticketId: TicketId.fromString(s.ticketId) }
}

function dehydrateStatus(s: StatusUpdate): SerialisedStatusUpdate {
  return { ...s, ticketId: serialiseTicketId(s.ticketId) }
}

function rehydrateStatus(s: SerialisedStatusUpdate): StatusUpdate {
  return { ...s, ticketId: TicketId.fromString(s.ticketId) }
}

function dehydrateMessage(m: Message): SerialisedMessage {
  return {
    ticketId: serialiseTicketId(m.ticketId),
    threadRoot: m.threadRoot,
    senderPubkey: m.senderPubkey,
    body: m.body,
    createdAt: m.createdAt,
    channel: m.channel,
  }
}

function rehydrateMessage(s: SerialisedMessage): Message {
  return new Message(
    TicketId.fromString(s.ticketId),
    s.threadRoot,
    s.senderPubkey,
    s.body,
    s.createdAt,
    s.channel,
  )
}

function dehydrateTicket(t: Ticket): SerialisedTicket {
  return {
    id: t.id.toString(),
    eventId: t.eventId,
    customerPubkey: t.customerPubkey,
    agentPubkey: t.agentPubkey,
    status: t.status,
    priority: t.priority,
    category: t.category,
    title: t.title,
    body: t.body,
    createdAt: t.createdAt,
  }
}

function rehydrateTicket(s: SerialisedTicket): Ticket {
  return new Ticket(
    TicketId.fromString(s.id),
    s.eventId,
    s.customerPubkey,
    s.agentPubkey,
    s.status,
    s.priority,
    s.category,
    s.title,
    s.body,
    s.createdAt,
  )
}

function dehydrateCsat(c: CsatResponse): SerialisedCsat {
  return { ...c, ticketId: serialiseTicketId(c.ticketId) }
}

function rehydrateCsat(s: SerialisedCsat): CsatResponse {
  return { ...s, ticketId: TicketId.fromString(s.ticketId) }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function snapshot(): CacheShape {
  return {
    tickets: [...get(tickets).values()].map(dehydrateTicket),
    replies: [...get(replies).entries()].map(([k, v]) => [k, v.map(dehydrateReply)]),
    notes: [...get(notes).entries()].map(([k, v]) => [k, v.map(dehydrateReply)]),
    messages: [...get(messages).entries()].map(([k, v]) => [k, v.map(dehydrateMessage)]),
    statusEvents: [...get(statusEvents).entries()].map(([k, v]) => [k, v.map(dehydrateStatus)]),
    csats: [...get(csats).entries()].map(([k, v]) => [k, dehydrateCsat(v)]),
    profiles: [...get(profiles).entries()],
  }
}

function scheduleSave(pubkey: string): void {
  if (!browser) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(cacheKey(pubkey), JSON.stringify(snapshot()))
    } catch {
      /* quota / disabled */
    }
  }, 250)
}

export function hydrateFromCache(pubkey: string): boolean {
  if (!browser) return false
  try {
    const raw = localStorage.getItem(cacheKey(pubkey))
    if (!raw) return false
    const data = JSON.parse(raw) as CacheShape
    tickets.set(new Map(data.tickets.map((s) => [s.id, rehydrateTicket(s)])))
    replies.set(new Map(data.replies.map(([k, v]) => [k, v.map(rehydrateReply)])))
    notes.set(new Map(data.notes.map(([k, v]) => [k, v.map(rehydrateReply)])))
    messages.set(new Map(data.messages.map(([k, v]) => [k, v.map(rehydrateMessage)])))
    statusEvents.set(new Map(data.statusEvents.map(([k, v]) => [k, v.map(rehydrateStatus)])))
    csats.set(new Map(data.csats.map(([k, v]) => [k, rehydrateCsat(v)])))
    profiles.set(new Map(data.profiles))
    return true
  } catch {
    return false
  }
}

let unsubAll: Array<() => void> = []

export function startPersistence(pubkey: string): void {
  stopPersistence()
  if (!browser) return
  const save = (): void => scheduleSave(pubkey)
  unsubAll = [
    tickets.subscribe(save),
    replies.subscribe(save),
    notes.subscribe(save),
    messages.subscribe(save),
    statusEvents.subscribe(save),
    csats.subscribe(save),
    profiles.subscribe(save),
  ]
}

export function stopPersistence(): void {
  for (const u of unsubAll) u()
  unsubAll = []
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
}

export function clearCache(pubkey: string): void {
  if (!browser) return
  try {
    localStorage.removeItem(cacheKey(pubkey))
  } catch {}
}

// Convenience: hydrate when an identity becomes known
identity.subscribe((id) => {
  if (id) hydrateFromCache(id.pubkey)
})
