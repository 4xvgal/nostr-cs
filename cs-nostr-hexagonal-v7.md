# CS Nostr Framework — Final Design Document v7.1

> CS-dedicated Nostr framework based on NIP-17 / NIP-44 / NIP-65 / NIP-66  
> Hexagonal architecture / `@nostr-dev-kit/ndk`-only / ESM / universal (browser & Node.js)

---

## 1. Design Principles

- **The domain core** knows nothing about NDK or any other external library
- **Port signatures must not expose NDK types either** — abstracted as `UnsignedEvent` / `SignedEvent` / `SubscriptionFilter`
- **Only adapters** know NDK — no other nostr library is allowed
- **`CSClient`** wraps the internal complexity as a facade — the user sees a simple API
- **`KeyProvider` port** allows injecting any `NDKSigner`-compatible implementation from the outside
- **Event publication can be fully delegated** to an external signer (`signAndPublish` option — including routing)
- **Ticket title lives inside encrypted content** — `ticket_id` is a UUIDv7 (128-bit)
- **Relay-role separation** — `bootstrap` (required), `write`, `read`, `dm` are each configured independently
- **NIP-65 (kind 10002)** — advertises write/read relays; spread at `connect()` time
- **NIP-17 (kind 10050)** — advertises a dedicated DM-inbox relay set
- **NIP-66 Relay Discovery** — dynamically queries the public relay list (connects explicitly to `MONITOR_RELAYS`)
- **Per-recipient routing** — on every publish, the recipient's read/dm relays are resolved anew via `RelayDiscoveryService`
- Dependencies always flow from outer to inner — never the other way

---

## 2. Single Dependency

```json
{
  "dependencies": {
    "@nostr-dev-kit/ndk": "latest"
  }
}
```

Just `@nostr-dev-kit/ndk`. UUID, SHA and any other utility are handled in-house via `globalThis.crypto`.

---

## 3. Kind Numbers

| Kind | Name | Publisher | content encryption |
|------|------|-----------|--------------------|
| `7700` | Ticket creation | Customer | NIP-44 (→ agent) |
| `7701` | Status update | Agent | none (tags only) |
| `7702` | Agent reply | Agent | NIP-44 (→ customer) |
| `7703` | Internal agent note | Agent | NIP-44 (→ agent) |
| `7704` | CSAT response | Customer | none (plaintext) |
| `14` | NIP-17 rumor (DM) | both | — (never hits a relay directly) |
| `1059` | NIP-17 gift wrap | both | the actual wire format on relays |

- The `7700` range is currently an unassigned NIP slot
- **NIP-17 note**: the wire-format kind published to relays is `1059`. Kind `14` is the rumor inside the seal (observable only after decryption)

---

## 4. Ticket-ID Strategy — UUIDv7

### Format

```
ticket_id = UUIDv7 (RFC 9562, 128-bit)
example  = "018f1a2b-3c4d-7abc-8def-0123456789ab"
```

- First 48 bits = Unix milliseconds → time-ordered
- Remaining 74 bits = CSPRNG random → not reversible
- No hash layer → smaller attack surface, no browser/Node branching
- No seq counter → safe for distributed generation

### Public (tags — used for filtering)

```json
["ticket_id", "018f1a2b-3c4d-7abc-8def-0123456789ab"],
["status",    "open"],
["priority",  "high"],
["category",  "billing"],
["p",         "<agent_pubkey>"]
```

### Private (content — NIP-44 encrypted)

```json
{
  "ticket_id": "018f1a2b-3c4d-7abc-8def-0123456789ab",
  "title":     "Payment error inquiry",
  "body":      "My payment keeps failing..."
}
```

### TicketId value object

```typescript
// domain/value-objects/TicketId.ts

export class TicketId {
  private constructor(private readonly value: string) {}

  static generate(): TicketId {
    const ts    = BigInt(Date.now())
    const bytes = new Uint8Array(16)
    bytes[0] = Number((ts >> 40n) & 0xffn)
    bytes[1] = Number((ts >> 32n) & 0xffn)
    bytes[2] = Number((ts >> 24n) & 0xffn)
    bytes[3] = Number((ts >> 16n) & 0xffn)
    bytes[4] = Number((ts >>  8n) & 0xffn)
    bytes[5] = Number( ts         & 0xffn)

    const rand = new Uint8Array(10)
    globalThis.crypto.getRandomValues(rand)
    bytes.set(rand, 6)

    bytes[6] = (bytes[6] & 0x0f) | 0x70  // version 7
    bytes[8] = (bytes[8] & 0x3f) | 0x80  // variant 10

    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
    return new TicketId(
      `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    )
  }

  static fromString(raw: string): TicketId {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(raw)) {
      throw new Error(`invalid UUIDv7: ${raw}`)
    }
    return new TicketId(raw)
  }

  toString(): string { return this.value }
  timestampMs(): number {
    const hex = this.value.replace(/-/g, '').slice(0, 12)
    return Number(BigInt('0x' + hex))
  }
  equals(other: TicketId): boolean { return this.value === other.value }
}
```

---

## 5. Event Schemas

### kind 7700 — ticket creation

```json
{
  "kind": 7700,
  "pubkey": "<customer_pubkey>",
  "tags": [
    ["ticket_id", "018f1a2b-3c4d-7abc-8def-0123456789ab"],
    ["status",    "open"],
    ["priority",  "high"],
    ["category",  "billing"],
    ["p",         "<agent_pubkey>"]
  ],
  "content": "<NIP-44 ciphertext>",
  "created_at": 1714000000
}
```

After decryption:

```json
{
  "ticket_id": "018f1a2b-3c4d-7abc-8def-0123456789ab",
  "title":     "Payment error inquiry",
  "body":      "My payment keeps failing..."
}
```

### kind 7701 — status update

```json
{
  "kind": 7701,
  "pubkey": "<agent_pubkey>",
  "tags": [
    ["e",         "<7700_event_id>"],
    ["ticket_id", "018f1a2b-3c4d-7abc-8def-0123456789ab"],
    ["status",    "in_progress"],
    ["p",         "<customer_pubkey>"]
  ],
  "content": ""
}
```

### kind 7702 — agent reply

```json
{
  "kind": 7702,
  "pubkey": "<agent_pubkey>",
  "tags": [
    ["e",         "<7700_event_id>"],
    ["ticket_id", "018f1a2b-3c4d-7abc-8def-0123456789ab"],
    ["p",         "<customer_pubkey>"]
  ],
  "content": "<NIP-44 ciphertext>"
}
```

After decryption:

```json
{
  "ticket_id": "018f1a2b-3c4d-7abc-8def-0123456789ab",
  "body":      "Let me check your payment history."
}
```

### kind 14 / 1059 — NIP-17 DM

The wire-format event on the relay is kind `1059` (gift wrap). The inner rumor is kind `14` and carries these extra tags:

```json
// rumor (kind 14, visible only after decryption)
{
  "kind": 14,
  "pubkey": "<sender_pubkey>",
  "tags": [
    ["e",         "<7700_event_id>"],
    ["ticket_id", "018f1a2b-3c4d-7abc-8def-0123456789ab"],
    ["p",         "<recipient_pubkey>"]
  ],
  "content": "Could you provide more details, please?"
}
```

### kind 7703 — internal agent note

```json
{
  "kind": 7703,
  "pubkey": "<agent_pubkey>",
  "tags": [
    ["e",         "<7700_event_id>"],
    ["ticket_id", "018f1a2b-3c4d-7abc-8def-0123456789ab"],
    ["p",         "<other_agent_pubkey>"]
  ],
  "content": "<NIP-44 ciphertext>"
}
```

The customer pubkey must **never** appear in the `p`-tag. For team sharing, publish once per agent (each event is encrypted to its recipient individually).

### kind 7704 — CSAT response

```json
{
  "kind": 7704,
  "pubkey": "<customer_pubkey>",
  "tags": [
    ["e",         "<7700_event_id>"],
    ["ticket_id", "018f1a2b-3c4d-7abc-8def-0123456789ab"],
    ["p",         "<agent_pubkey>"],
    ["rating",    "5"]
  ],
  "content": "Thanks for the quick turnaround."
}
```

---

## 6. Event-Linking Structure

```
kind 7700 (ticket created, customer)
  ├── kind 7701 (status change, agent)     e-tag → 7700
  ├── kind 7702 (reply, agent)             e-tag → 7700
  ├── kind 14/1059 (DM, both sides)        e-tag → 7700 (rumor tag)
  ├── kind 7703 (internal note, agent)     e-tag → 7700
  └── kind 7704 (CSAT, customer)           e-tag → 7700
```

---

## 7. Folder Structure

```
nostr-cs/
│
├── src/
│   ├── domain/                              # no external dependencies
│   │   ├── entities/
│   │   │   ├── Ticket.ts
│   │   │   ├── Message.ts
│   │   │   ├── NostrProfile.ts              # kind 0 + cs_role
│   │   │   ├── TicketReply.ts
│   │   │   ├── StatusUpdate.ts
│   │   │   └── CsatResponse.ts
│   │   ├── value-objects/
│   │   │   ├── TicketId.ts                  # UUIDv7
│   │   │   ├── TicketStatus.ts              # string union
│   │   │   ├── Priority.ts                  # string union
│   │   │   ├── Category.ts                  # string union
│   │   │   └── RelaySet.ts                  # NIP-65 write/read
│   │   └── services/
│   │       └── RelayDiscoveryService.ts     # NIP-65/17 routing
│   │
│   ├── application/
│   │   ├── ports/
│   │   │   ├── inbound/
│   │   │   │   ├── CustomerPort.ts
│   │   │   │   └── AgentPort.ts
│   │   │   └── outbound/
│   │   │       ├── NostrEventPort.ts        # UnsignedEvent/SignedEvent
│   │   │       ├── CryptoPort.ts
│   │   │       ├── KeyProvider.ts
│   │   │       ├── ProfilePort.ts
│   │   │       ├── RelayIndexPort.ts        # NIP-66
│   │   │       └── EventBusPort.ts          # inbound-event pub/sub
│   │   └── use-cases/
│   │       ├── publish/
│   │       │   ├── BootstrapUseCase.ts
│   │       │   ├── CreateTicketUseCase.ts
│   │       │   ├── ReplyTicketUseCase.ts
│   │       │   ├── UpdateStatusUseCase.ts
│   │       │   ├── SendDMUseCase.ts
│   │       │   ├── InternalNoteUseCase.ts
│   │       │   └── SubmitCsatUseCase.ts
│   │       └── subscribe/
│   │           ├── SubscribeAsCustomerUseCase.ts
│   │           └── SubscribeAsAgentUseCase.ts
│   │
│   ├── infrastructure/
│   │   ├── adapters/
│   │   │   ├── inbound/                     # (thin — CSClient calls directly)
│   │   │   │   ├── CustomerAdapter.ts
│   │   │   │   └── AgentAdapter.ts
│   │   │   └── outbound/
│   │   │       ├── NDKRelayAdapter.ts
│   │   │       ├── NDKCryptoAdapter.ts
│   │   │       ├── NDKProfileAdapter.ts
│   │   │       ├── NDKRelayIndexAdapter.ts
│   │   │       ├── InMemoryEventBus.ts
│   │   │       └── key-providers/
│   │   │           ├── PrivateKeyProvider.ts
│   │   │           ├── NIP07KeyProvider.ts
│   │   │           └── NIP46KeyProvider.ts
│   │   └── di/
│   │       └── container.ts
│   │
│   ├── CSClient.ts
│   └── index.ts
│
└── package.json
```

---

## 8. Port Interfaces

### 8.1 Shared primitive types

```typescript
// application/ports/outbound/NostrEventPort.ts

/** Domain-neutral event — not yet signed */
export interface UnsignedEvent {
  kind:       number
  tags:       string[][]
  content:    string
  created_at: number
}

/** A signed event */
export interface SignedEvent extends UnsignedEvent {
  id:     string
  pubkey: string
  sig:    string
}

/** Tag filters use keys prefixed with `#`: "#p", "#e", "#ticket_id", etc. */
export type SubscriptionFilter = {
  kinds?:   number[]
  authors?: string[]
  since?:   number
  until?:   number
  limit?:   number
} & { [tag: `#${string}`]: string[] | undefined }

export interface Subscription {
  close(): void
}

export interface NostrEventPort {
  /**
   * Sign the raw event internally and publish.
   * If `targetRelays` is given, publishes only to those relays.
   */
  publish(
    event:         UnsignedEvent,
    targetRelays?: string[],
  ): Promise<SignedEvent>

  /**
   * Subscribe — receive events matching `filter` from the given relays.
   * Call `Subscription.close()` on the returned object to unsubscribe.
   */
  subscribe(
    filter:  SubscriptionFilter,
    onEvent: (event: SignedEvent) => void,
    opts?:   { relays?: string[] },
  ): Subscription
}
```

### 8.2 CryptoPort

```typescript
// application/ports/outbound/CryptoPort.ts

export interface Nip17Rumor {
  kind:       14
  tags:       string[][]
  content:    string
  created_at: number
}

export interface Nip17Unsealed extends Nip17Rumor {
  pubkey: string   // original author
}

export interface CryptoPort {
  /** NIP-44 */
  encrypt(plaintext: string,   recipientPubkey: string): Promise<string>
  decrypt(ciphertext: string,  senderPubkey:    string): Promise<string>

  /** NIP-17: rumor(kind 14) → seal → gift-wrap(kind 1059) SignedEvent */
  sealAndWrap(
    rumor:           Nip17Rumor,
    recipientPubkey: string,
  ): Promise<SignedEvent>

  /** NIP-17: gift-wrap(kind 1059) → unseal → rumor(kind 14) + original author */
  unwrapAndUnseal(giftWrap: SignedEvent): Promise<Nip17Unsealed>
}
```

### 8.3 KeyProvider

```typescript
// application/ports/outbound/KeyProvider.ts
import type { NDKSigner } from '@nostr-dev-kit/ndk'

export interface KeyProvider {
  getPubkey(): Promise<string>

  /** Adapter-facing — returns an NDKSigner. External custom implementations may no-op. */
  getNDKSigner(): NDKSigner

  /**
   * Optional — fully delegate sign + publish to an external signer.
   * When implemented, `NDKRelayAdapter.publish()` is bypassed.
   * The delegated signer must honour `targetRelays` as well.
   */
  signAndPublish?(
    rawEvent:      UnsignedEvent,
    targetRelays?: string[],
  ): Promise<SignedEvent>
}
```

### 8.4 ProfilePort

```typescript
// application/ports/outbound/ProfilePort.ts

export interface ProfilePort {
  // NIP-65 (kind 10002)
  fetchRelaySet(pubkey: string): Promise<RelaySet>
  publishRelaySet(relaySet: RelaySet, targetRelays: string[]): Promise<void>

  // NIP-17 (kind 10050)
  fetchDMRelays(pubkey: string): Promise<string[]>
  publishDMRelays(dmRelays: string[], targetRelays: string[]): Promise<void>

  // kind 0
  fetchProfile(pubkey: string, hintRelays?: string[]): Promise<NostrProfile>
  publishProfile(profile: NostrProfile, targetRelays: string[]): Promise<void>
}
```

### 8.5 RelayIndexPort (NIP-66)

```typescript
// application/ports/outbound/RelayIndexPort.ts

export interface RelayIndexFilter {
  noPayment?: boolean
  noAuth?:    boolean
  limit?:     number
}

export interface RelayIndexPort {
  fetchPublicRelays(filter?: RelayIndexFilter): Promise<string[]>
}
```

### 8.6 EventBusPort (inbound events)

```typescript
// application/ports/outbound/EventBusPort.ts
import type { Ticket } from '../../../domain/entities/Ticket'
import type { Message } from '../../../domain/entities/Message'
import type { TicketReply } from '../../../domain/entities/TicketReply'
import type { StatusUpdate } from '../../../domain/entities/StatusUpdate'
import type { CsatResponse } from '../../../domain/entities/CsatResponse'

export type CSEvent =
  | { type: 'ticket:created';   payload: Ticket }
  | { type: 'ticket:reply';     payload: TicketReply }
  | { type: 'ticket:note';      payload: TicketReply }
  | { type: 'status:changed';   payload: StatusUpdate }
  | { type: 'message:received'; payload: Message }
  | { type: 'csat:submitted';   payload: CsatResponse }

export interface EventBusPort {
  emit(event: CSEvent): void
  on<T extends CSEvent['type']>(
    type:    T,
    handler: (payload: Extract<CSEvent, { type: T }>['payload']) => void,
  ): () => void  // returns an unsubscribe function
}
```

### 8.7 CustomerPort / AgentPort (inbound)

```typescript
// application/ports/inbound/CustomerPort.ts
export interface CustomerPort {
  createTicket(params: CreateTicketParams): Promise<Ticket>
  sendMessage(params: SendMessageParams):   Promise<void>
  submitCsat(params: SubmitCsatParams):     Promise<void>
}

// application/ports/inbound/AgentPort.ts
export interface AgentPort {
  replyTicket(params:     ReplyParams):         Promise<void>
  updateStatus(params:    UpdateStatusParams):  Promise<void>
  addInternalNote(params: InternalNoteParams):  Promise<void>
  sendMessage(params:     SendMessageParams):   Promise<void>
}
```

---

## 9. Domain Entities & Value Objects

### 9.1 Value objects

```typescript
// domain/value-objects/TicketStatus.ts
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export const TicketStatus = {
  Open:       'open'        as TicketStatus,
  InProgress: 'in_progress' as TicketStatus,
  Resolved:   'resolved'    as TicketStatus,
  Closed:     'closed'      as TicketStatus,
}

// domain/value-objects/Priority.ts
export type Priority = 'low' | 'normal' | 'high' | 'urgent'

// domain/value-objects/Category.ts
export type Category = 'billing' | 'technical' | 'general'
```

### 9.2 RelaySet

```typescript
// domain/value-objects/RelaySet.ts

export class RelaySet {
  constructor(
    readonly write: string[],
    readonly read:  string[],
  ) {}

  static fromNIP65Tags(tags: string[][]): RelaySet {
    const write: string[] = []
    const read:  string[] = []
    for (const tag of tags) {
      if (tag[0] !== 'r' || !tag[1]) continue
      const marker = tag[2]
      if (!marker || marker === 'write') write.push(tag[1])
      if (!marker || marker === 'read')  read.push(tag[1])
    }
    return new RelaySet(write, read)
  }

  toNIP65Tags(): string[][] {
    const tags: string[][] = []
    const w = new Set(this.write)
    const r = new Set(this.read)
    for (const url of w) tags.push(r.has(url) ? ['r', url] : ['r', url, 'write'])
    for (const url of r) if (!w.has(url)) tags.push(['r', url, 'read'])
    return tags
  }
}
```

### 9.3 Entities / DTOs

```typescript
// domain/entities/Ticket.ts
import { TicketId } from '../value-objects/TicketId'
import type { TicketStatus } from '../value-objects/TicketStatus'
import type { Priority } from '../value-objects/Priority'
import type { Category } from '../value-objects/Category'

export class Ticket {
  constructor(
    readonly id:             TicketId,
    readonly eventId:        string,       // kind 7700 event id (target of e-tags)
    readonly customerPubkey: string,
    readonly agentPubkey:    string,
    readonly status:         TicketStatus,
    readonly priority:       Priority,
    readonly category:       Category,
    readonly title:          string,
    readonly body:           string,
    readonly createdAt:      number,       // unix seconds
  ) {}
}

// domain/entities/Message.ts
import { TicketId } from '../value-objects/TicketId'

export class Message {
  constructor(
    readonly ticketId:     TicketId,
    readonly threadRoot:   string,           // 7700 event id
    readonly senderPubkey: string,
    readonly body:         string,
    readonly createdAt:    number,
    readonly channel:      'dm' | 'reply',   // kind 14 or 7702
  ) {}
}

// domain/entities/TicketReply.ts
import { TicketId } from '../value-objects/TicketId'
export interface TicketReply {
  ticketId:   TicketId
  threadRoot: string
  byPubkey:   string
  body:       string
  at:         number
}

// domain/entities/StatusUpdate.ts
import { TicketId } from '../value-objects/TicketId'
import type { TicketStatus } from '../value-objects/TicketStatus'
export interface StatusUpdate {
  ticketId:   TicketId
  threadRoot: string
  newStatus:  TicketStatus
  byPubkey:   string
  at:         number
}

// domain/entities/CsatResponse.ts
import { TicketId } from '../value-objects/TicketId'
export interface CsatResponse {
  ticketId:   TicketId
  threadRoot: string
  rating:     1 | 2 | 3 | 4 | 5
  comment:    string
  byPubkey:   string
  at:         number
}

// domain/entities/NostrProfile.ts
import { RelaySet } from '../value-objects/RelaySet'
export class NostrProfile {
  constructor(
    readonly pubkey:   string,
    readonly name:     string,
    readonly about:    string,
    readonly picture:  string,
    readonly csRole:   'agent' | 'customer' | undefined,
    readonly relaySet: RelaySet,
  ) {}
}
```

### 9.4 RelayDiscoveryService

```typescript
// domain/services/RelayDiscoveryService.ts

export class RelayDiscoveryService {
  constructor(
    private readonly profilePort:     ProfilePort,
    private readonly bootstrapRelays: string[],
  ) {}

  async resolveProfile(pubkey: string): Promise<NostrProfile> {
    const relaySet = await this.resolveRelays(pubkey)
    return this.profilePort.fetchProfile(pubkey, relaySet.write)
  }

  async resolveRelays(pubkey: string): Promise<RelaySet> {
    try {
      return await this.profilePort.fetchRelaySet(pubkey)
    } catch {
      return new RelaySet(this.bootstrapRelays, this.bootstrapRelays)
    }
  }

  /** Target relays for ticket/reply (kind 7700–7703) — the recipient's read relays */
  async getPublishRelays(recipientPubkey: string): Promise<string[]> {
    const rs = await this.resolveRelays(recipientPubkey)
    return rs.read.length > 0 ? rs.read : this.bootstrapRelays
  }

  /** Target relays for DM (kind 1059) — kind 10050 preferred, fall back to kind 10002 read, then bootstrap */
  async getDMRelays(recipientPubkey: string): Promise<string[]> {
    try {
      const dm = await this.profilePort.fetchDMRelays(recipientPubkey)
      if (dm.length > 0) return dm
    } catch {}
    return this.getPublishRelays(recipientPubkey)
  }
}
```

---

## 10. Use Cases — Publish

Every publish use case follows the same shape:

```
1. Resolve targetRelays via RelayDiscoveryService
2. Encrypt if needed (NIP-44 or NIP-17)
3. Assemble the UnsignedEvent
4. If keyProvider.signAndPublish exists → delegate
   Otherwise → nostrEvent.publish(raw, targetRelays)
5. Return a local domain object and emit via eventBus when applicable
```

### 10.1 CreateTicketUseCase

```typescript
// application/use-cases/publish/CreateTicketUseCase.ts

export interface CreateTicketParams {
  title:       string
  body:        string
  agentPubkey: string
  priority:    Priority
  category:    Category
}

export class CreateTicketUseCase {
  constructor(
    private readonly nostrEvent:     NostrEventPort,
    private readonly crypto:         CryptoPort,
    private readonly keyProvider:    KeyProvider,
    private readonly relayDiscovery: RelayDiscoveryService,
    private readonly eventBus:       EventBusPort,
  ) {}

  async execute(p: CreateTicketParams): Promise<Ticket> {
    const customer     = await this.keyProvider.getPubkey()
    const ticketId     = TicketId.generate()
    const targetRelays = await this.relayDiscovery.getPublishRelays(p.agentPubkey)
    const encrypted    = await this.crypto.encrypt(
      JSON.stringify({
        ticket_id: ticketId.toString(),
        title:     p.title,
        body:      p.body,
      }),
      p.agentPubkey,
    )

    const raw: UnsignedEvent = {
      kind: 7700,
      tags: [
        ['ticket_id', ticketId.toString()],
        ['status',    'open'],
        ['priority',  p.priority],
        ['category',  p.category],
        ['p',         p.agentPubkey],
      ],
      content:    encrypted,
      created_at: Math.floor(Date.now() / 1000),
    }

    const signed = this.keyProvider.signAndPublish
      ? await this.keyProvider.signAndPublish(raw, targetRelays)
      : await this.nostrEvent.publish(raw, targetRelays)

    const ticket = new Ticket(
      ticketId, signed.id, customer, p.agentPubkey,
      'open', p.priority, p.category, p.title, p.body, raw.created_at,
    )
    this.eventBus.emit({ type: 'ticket:created', payload: ticket })
    return ticket
  }
}
```

### 10.2 ReplyTicketUseCase

```typescript
// application/use-cases/publish/ReplyTicketUseCase.ts

export interface ReplyParams {
  ticketId:       TicketId
  threadRoot:     string          // kind 7700 event id
  body:           string
  customerPubkey: string
}

export class ReplyTicketUseCase {
  constructor(
    private readonly nostrEvent:     NostrEventPort,
    private readonly crypto:         CryptoPort,
    private readonly keyProvider:    KeyProvider,
    private readonly relayDiscovery: RelayDiscoveryService,
  ) {}

  async execute(p: ReplyParams): Promise<void> {
    const targetRelays = await this.relayDiscovery.getPublishRelays(p.customerPubkey)
    const encrypted    = await this.crypto.encrypt(
      JSON.stringify({ ticket_id: p.ticketId.toString(), body: p.body }),
      p.customerPubkey,
    )

    const raw: UnsignedEvent = {
      kind: 7702,
      tags: [
        ['e',         p.threadRoot],
        ['ticket_id', p.ticketId.toString()],
        ['p',         p.customerPubkey],
      ],
      content:    encrypted,
      created_at: Math.floor(Date.now() / 1000),
    }

    if (this.keyProvider.signAndPublish) {
      await this.keyProvider.signAndPublish(raw, targetRelays)
    } else {
      await this.nostrEvent.publish(raw, targetRelays)
    }
  }
}
```

### 10.3 UpdateStatusUseCase

```typescript
// application/use-cases/publish/UpdateStatusUseCase.ts

export interface UpdateStatusParams {
  ticketId:       TicketId
  threadRoot:     string
  newStatus:      TicketStatus
  customerPubkey: string
}

export class UpdateStatusUseCase {
  constructor(
    private readonly nostrEvent:     NostrEventPort,
    private readonly keyProvider:    KeyProvider,
    private readonly relayDiscovery: RelayDiscoveryService,
  ) {}

  async execute(p: UpdateStatusParams): Promise<void> {
    const targetRelays = await this.relayDiscovery.getPublishRelays(p.customerPubkey)
    const raw: UnsignedEvent = {
      kind: 7701,
      tags: [
        ['e',         p.threadRoot],
        ['ticket_id', p.ticketId.toString()],
        ['status',    p.newStatus],
        ['p',         p.customerPubkey],
      ],
      content:    '',
      created_at: Math.floor(Date.now() / 1000),
    }

    if (this.keyProvider.signAndPublish) {
      await this.keyProvider.signAndPublish(raw, targetRelays)
    } else {
      await this.nostrEvent.publish(raw, targetRelays)
    }
  }
}
```

### 10.4 SendDMUseCase (NIP-17)

```typescript
// application/use-cases/publish/SendDMUseCase.ts

export interface SendMessageParams {
  ticketId:        TicketId
  threadRoot:      string
  content:         string
  recipientPubkey: string
}

export class SendDMUseCase {
  constructor(
    private readonly nostrEvent:     NostrEventPort,
    private readonly crypto:         CryptoPort,
    private readonly keyProvider:    KeyProvider,
    private readonly relayDiscovery: RelayDiscoveryService,
  ) {}

  async execute(p: SendMessageParams): Promise<void> {
    const targetRelays = await this.relayDiscovery.getDMRelays(p.recipientPubkey)

    const rumor: Nip17Rumor = {
      kind: 14,
      tags: [
        ['e',         p.threadRoot],
        ['ticket_id', p.ticketId.toString()],
        ['p',         p.recipientPubkey],
      ],
      content:    p.content,
      created_at: Math.floor(Date.now() / 1000),
    }

    // seal + gift-wrap is handled in the adapter via NDK's NIP-17 helpers
    const giftWrap = await this.crypto.sealAndWrap(rumor, p.recipientPubkey)

    // The gift wrap is already a SignedEvent — publish as is
    await this.nostrEvent.publish(giftWrap, targetRelays)
  }
}
```

> **Note**: `nostrEvent.publish` takes an `UnsignedEvent`, but the adapter's implementation skips re-signing when the input already looks signed (i.e. carries `id` / `sig`). See §12.

### 10.5 InternalNoteUseCase

```typescript
// application/use-cases/publish/InternalNoteUseCase.ts

export interface InternalNoteParams {
  ticketId:          TicketId
  threadRoot:        string
  body:              string
  otherAgentPubkeys: string[]    // agents that should receive this note
}

export class InternalNoteUseCase {
  constructor(
    private readonly nostrEvent:     NostrEventPort,
    private readonly crypto:         CryptoPort,
    private readonly keyProvider:    KeyProvider,
    private readonly relayDiscovery: RelayDiscoveryService,
  ) {}

  async execute(p: InternalNoteParams): Promise<void> {
    // One encrypted event per recipient. The customer pubkey must never appear in the p-tag.
    await Promise.all(p.otherAgentPubkeys.map(async (agentPk) => {
      const targetRelays = await this.relayDiscovery.getPublishRelays(agentPk)
      const encrypted    = await this.crypto.encrypt(
        JSON.stringify({ ticket_id: p.ticketId.toString(), body: p.body }),
        agentPk,
      )
      const raw: UnsignedEvent = {
        kind: 7703,
        tags: [
          ['e',         p.threadRoot],
          ['ticket_id', p.ticketId.toString()],
          ['p',         agentPk],
        ],
        content:    encrypted,
        created_at: Math.floor(Date.now() / 1000),
      }
      if (this.keyProvider.signAndPublish) {
        await this.keyProvider.signAndPublish(raw, targetRelays)
      } else {
        await this.nostrEvent.publish(raw, targetRelays)
      }
    }))
  }
}
```

### 10.6 SubmitCsatUseCase

```typescript
// application/use-cases/publish/SubmitCsatUseCase.ts

export interface SubmitCsatParams {
  ticketId:    TicketId
  threadRoot:  string
  agentPubkey: string
  rating:      1 | 2 | 3 | 4 | 5
  comment:     string
}

export class SubmitCsatUseCase {
  constructor(
    private readonly nostrEvent:     NostrEventPort,
    private readonly keyProvider:    KeyProvider,
    private readonly relayDiscovery: RelayDiscoveryService,
  ) {}

  async execute(p: SubmitCsatParams): Promise<void> {
    const targetRelays = await this.relayDiscovery.getPublishRelays(p.agentPubkey)
    const raw: UnsignedEvent = {
      kind: 7704,
      tags: [
        ['e',         p.threadRoot],
        ['ticket_id', p.ticketId.toString()],
        ['p',         p.agentPubkey],
        ['rating',    String(p.rating)],
      ],
      content:    p.comment,
      created_at: Math.floor(Date.now() / 1000),
    }
    if (this.keyProvider.signAndPublish) {
      await this.keyProvider.signAndPublish(raw, targetRelays)
    } else {
      await this.nostrEvent.publish(raw, targetRelays)
    }
  }
}
```

### 10.7 BootstrapUseCase

```typescript
// application/use-cases/publish/BootstrapUseCase.ts

export interface ResolvedRelayConfig {
  bootstrap: string[]
  write:     string[]
  read:      string[]
  dm:        string[]
}

export class BootstrapUseCase {
  constructor(
    private readonly profilePort:  ProfilePort,
    private readonly relayIndex:   RelayIndexPort,
    private readonly keyProvider:  KeyProvider,
    private readonly relayConfig:  ResolvedRelayConfig,
    private readonly profileMeta?: { name: string; csRole: 'agent' | 'customer' },
  ) {}

  async execute(): Promise<void> {
    const pubkey = await this.keyProvider.getPubkey()

    const publicRelays = await this.relayIndex
      .fetchPublicRelays({ noPayment: true, noAuth: true, limit: 10 })
      .catch(() => [] as string[])

    const spreadRelays = [...new Set([
      ...this.relayConfig.bootstrap,
      ...publicRelays,
    ])]

    const relaySet = new RelaySet(this.relayConfig.write, this.relayConfig.read)
    await this.profilePort.publishRelaySet(relaySet, spreadRelays)

    if (this.relayConfig.dm.length > 0) {
      await this.profilePort.publishDMRelays(this.relayConfig.dm, spreadRelays)
    }

    if (this.profileMeta) {
      const profile = new NostrProfile(
        pubkey,
        this.profileMeta.name,
        '', '',
        this.profileMeta.csRole,
        relaySet,
      )
      await this.profilePort.publishProfile(profile, spreadRelays)
    }
  }
}
```

---

## 11. Use Cases — Subscribe / Receive

Two axes for incoming traffic: a customer only cares about traffic from an agent, while an agent cares about traffic from customers and peer agents.

### 11.1 SubscribeAsCustomerUseCase

```typescript
// application/use-cases/subscribe/SubscribeAsCustomerUseCase.ts

export class SubscribeAsCustomerUseCase {
  private subs: Subscription[] = []

  constructor(
    private readonly nostrEvent:  NostrEventPort,
    private readonly crypto:      CryptoPort,
    private readonly keyProvider: KeyProvider,
    private readonly relayConfig: ResolvedRelayConfig,
    private readonly eventBus:    EventBusPort,
  ) {}

  async execute(): Promise<void> {
    const me = await this.keyProvider.getPubkey()

    // 1. Agent replies and status updates arrive on my read relays
    this.subs.push(this.nostrEvent.subscribe(
      { kinds: [7701, 7702], '#p': [me] },
      async (ev) => this.handleTicketEvent(ev),
      { relays: this.relayConfig.read },
    ))

    // 2. NIP-17 DM (gift wrap, kind 1059) arrives on my DM relays
    this.subs.push(this.nostrEvent.subscribe(
      { kinds: [1059], '#p': [me] },
      async (ev) => this.handleGiftWrap(ev),
      { relays: this.relayConfig.dm },
    ))
  }

  private async handleTicketEvent(ev: SignedEvent): Promise<void> {
    const ticketIdStr = ev.tags.find(t => t[0] === 'ticket_id')?.[1]
    const threadRoot  = ev.tags.find(t => t[0] === 'e')?.[1]
    if (!ticketIdStr || !threadRoot) return
    const ticketId = TicketId.fromString(ticketIdStr)

    if (ev.kind === 7701) {
      const newStatus = ev.tags.find(t => t[0] === 'status')?.[1] as TicketStatus | undefined
      if (!newStatus) return
      this.eventBus.emit({
        type: 'status:changed',
        payload: {
          ticketId, threadRoot, newStatus,
          byPubkey: ev.pubkey, at: ev.created_at,
        },
      })
    } else if (ev.kind === 7702) {
      const plain = await this.crypto.decrypt(ev.content, ev.pubkey)
      const body  = JSON.parse(plain).body as string
      this.eventBus.emit({
        type: 'ticket:reply',
        payload: { ticketId, threadRoot, body, byPubkey: ev.pubkey, at: ev.created_at },
      })
      this.eventBus.emit({
        type: 'message:received',
        payload: new Message(ticketId, threadRoot, ev.pubkey, body, ev.created_at, 'reply'),
      })
    }
  }

  private async handleGiftWrap(wrap: SignedEvent): Promise<void> {
    try {
      const rumor = await this.crypto.unwrapAndUnseal(wrap)
      const ticketIdStr = rumor.tags.find(t => t[0] === 'ticket_id')?.[1]
      const threadRoot  = rumor.tags.find(t => t[0] === 'e')?.[1]
      if (!ticketIdStr || !threadRoot) return
      const ticketId = TicketId.fromString(ticketIdStr)
      this.eventBus.emit({
        type: 'message:received',
        payload: new Message(
          ticketId, threadRoot, rumor.pubkey, rumor.content, rumor.created_at, 'dm',
        ),
      })
    } catch { /* decryption failed — not addressed to me */ }
  }

  stop(): void {
    for (const s of this.subs) s.close()
    this.subs = []
  }
}
```

### 11.2 SubscribeAsAgentUseCase

```typescript
// application/use-cases/subscribe/SubscribeAsAgentUseCase.ts

export class SubscribeAsAgentUseCase {
  private subs: Subscription[] = []

  constructor(
    private readonly nostrEvent:  NostrEventPort,
    private readonly crypto:      CryptoPort,
    private readonly keyProvider: KeyProvider,
    private readonly relayConfig: ResolvedRelayConfig,
    private readonly eventBus:    EventBusPort,
  ) {}

  async execute(): Promise<void> {
    const me = await this.keyProvider.getPubkey()

    // 1. New tickets + internal notes + CSAT
    this.subs.push(this.nostrEvent.subscribe(
      { kinds: [7700, 7703, 7704], '#p': [me] },
      async (ev) => this.handle(ev),
      { relays: this.relayConfig.read },
    ))

    // 2. DM
    this.subs.push(this.nostrEvent.subscribe(
      { kinds: [1059], '#p': [me] },
      async (ev) => this.handleGiftWrap(ev),
      { relays: this.relayConfig.dm },
    ))
  }

  private async handle(ev: SignedEvent): Promise<void> {
    const ticketIdStr = ev.tags.find(t => t[0] === 'ticket_id')?.[1]
    if (!ticketIdStr) return
    const ticketId = TicketId.fromString(ticketIdStr)

    if (ev.kind === 7700) {
      const plain = await this.crypto.decrypt(ev.content, ev.pubkey)
      const body  = JSON.parse(plain) as { ticket_id: string; title: string; body: string }
      if (body.ticket_id !== ticketIdStr) return  // integrity check failed

      const priority = ev.tags.find(t => t[0] === 'priority')?.[1] as Priority
      const category = ev.tags.find(t => t[0] === 'category')?.[1] as Category
      const ticket = new Ticket(
        ticketId, ev.id, ev.pubkey, (await this.keyProvider.getPubkey()),
        'open', priority, category, body.title, body.body, ev.created_at,
      )
      this.eventBus.emit({ type: 'ticket:created', payload: ticket })

    } else if (ev.kind === 7703) {
      const threadRoot = ev.tags.find(t => t[0] === 'e')?.[1]
      if (!threadRoot) return
      const plain = await this.crypto.decrypt(ev.content, ev.pubkey)
      const body  = JSON.parse(plain).body as string
      this.eventBus.emit({
        type: 'ticket:note',
        payload: { ticketId, threadRoot, body, byPubkey: ev.pubkey, at: ev.created_at },
      })

    } else if (ev.kind === 7704) {
      const threadRoot = ev.tags.find(t => t[0] === 'e')?.[1]
      const rating     = Number(ev.tags.find(t => t[0] === 'rating')?.[1] ?? 0)
      if (!threadRoot || rating < 1 || rating > 5) return
      this.eventBus.emit({
        type: 'csat:submitted',
        payload: {
          ticketId, threadRoot,
          rating: rating as 1|2|3|4|5,
          comment: ev.content,
          byPubkey: ev.pubkey, at: ev.created_at,
        },
      })
    }
  }

  private async handleGiftWrap(wrap: SignedEvent): Promise<void> {
    try {
      const rumor = await this.crypto.unwrapAndUnseal(wrap)
      const ticketIdStr = rumor.tags.find(t => t[0] === 'ticket_id')?.[1]
      const threadRoot  = rumor.tags.find(t => t[0] === 'e')?.[1]
      if (!ticketIdStr || !threadRoot) return
      const ticketId = TicketId.fromString(ticketIdStr)
      this.eventBus.emit({
        type: 'message:received',
        payload: new Message(
          ticketId, threadRoot, rumor.pubkey, rumor.content, rumor.created_at, 'dm',
        ),
      })
    } catch { /* not for me */ }
  }

  stop(): void {
    for (const s of this.subs) s.close()
    this.subs = []
  }
}
```

---

## 12. Adapter Implementations

### 12.1 NDKRelayAdapter

```typescript
// infrastructure/adapters/outbound/NDKRelayAdapter.ts
import NDK, { NDKEvent, NDKFilter, NDKRelaySet, NDKSubscription } from '@nostr-dev-kit/ndk'

export class NDKRelayAdapter implements NostrEventPort {
  constructor(
    private readonly ndk:         NDK,
    private readonly keyProvider: KeyProvider,
  ) {}

  async publish(event: UnsignedEvent | SignedEvent, targetRelays?: string[]): Promise<SignedEvent> {
    const ndkEvent = new NDKEvent(this.ndk, event as any)

    // Skip re-signing if already signed (e.g. a NIP-17 gift wrap)
    if (!('sig' in event && event.sig)) {
      await ndkEvent.sign(this.keyProvider.getNDKSigner())
    }

    const relaySet = targetRelays && targetRelays.length > 0
      ? NDKRelaySet.fromRelayUrls(targetRelays, this.ndk)
      : undefined

    await ndkEvent.publish(relaySet)

    return {
      id:         ndkEvent.id!,
      pubkey:     ndkEvent.pubkey,
      kind:       ndkEvent.kind!,
      tags:       ndkEvent.tags,
      content:    ndkEvent.content,
      created_at: ndkEvent.created_at!,
      sig:        ndkEvent.sig!,
    }
  }

  subscribe(
    filter:  SubscriptionFilter,
    onEvent: (event: SignedEvent) => void,
    opts?:   { relays?: string[] },
  ): Subscription {
    const relaySet = opts?.relays && opts.relays.length > 0
      ? NDKRelaySet.fromRelayUrls(opts.relays, this.ndk)
      : undefined

    const sub: NDKSubscription = this.ndk.subscribe(
      filter as NDKFilter,
      { closeOnEose: false },
      relaySet,
    )

    sub.on('event', (ev: NDKEvent) => {
      onEvent({
        id:         ev.id,
        pubkey:     ev.pubkey,
        kind:       ev.kind!,
        tags:       ev.tags,
        content:    ev.content,
        created_at: ev.created_at!,
        sig:        ev.sig ?? '',
      })
    })

    return {
      close: () => sub.stop(),
    }
  }
}
```

### 12.2 NDKCryptoAdapter

```typescript
// infrastructure/adapters/outbound/NDKCryptoAdapter.ts
import NDK, { NDKEvent, NDKKind, giftWrap, giftUnwrap } from '@nostr-dev-kit/ndk'

export class NDKCryptoAdapter implements CryptoPort {
  constructor(
    private readonly ndk:         NDK,
    private readonly keyProvider: KeyProvider,
  ) {}

  async encrypt(plaintext: string, recipientPubkey: string): Promise<string> {
    return this.keyProvider.getNDKSigner().nip44Encrypt(
      this.ndk.getUser({ pubkey: recipientPubkey }),
      plaintext,
    )
  }

  async decrypt(ciphertext: string, senderPubkey: string): Promise<string> {
    return this.keyProvider.getNDKSigner().nip44Decrypt(
      this.ndk.getUser({ pubkey: senderPubkey }),
      ciphertext,
    )
  }

  /** NIP-17 seal + gift-wrap via NDK */
  async sealAndWrap(rumor: Nip17Rumor, recipientPubkey: string): Promise<SignedEvent> {
    const signer = this.keyProvider.getNDKSigner()
    const rumorEvent = new NDKEvent(this.ndk, {
      ...rumor,
      pubkey:     (await signer.user()).pubkey,
    } as any)

    const recipient = this.ndk.getUser({ pubkey: recipientPubkey })
    const wrap      = await giftWrap(rumorEvent, recipient, signer)

    return {
      id:         wrap.id!,
      pubkey:     wrap.pubkey,
      kind:       wrap.kind!,
      tags:       wrap.tags,
      content:    wrap.content,
      created_at: wrap.created_at!,
      sig:        wrap.sig!,
    }
  }

  async unwrapAndUnseal(giftWrapEvt: SignedEvent): Promise<Nip17Unsealed> {
    const signer = this.keyProvider.getNDKSigner()
    const wrap   = new NDKEvent(this.ndk, giftWrapEvt as any)
    const rumor  = await giftUnwrap(wrap, await signer.user(), signer)

    return {
      kind:       14,
      pubkey:     rumor.pubkey,
      tags:       rumor.tags,
      content:    rumor.content,
      created_at: rumor.created_at!,
    }
  }
}
```

> **Note**: the exact export names for NDK's NIP-17 helpers (`giftWrap` / `giftUnwrap` / `NDKNip17`, etc.) should be reconciled against the installed NDK version. The port signatures stay stable — only the inside of the adapter has to follow upstream.

### 12.3 NDKProfileAdapter

```typescript
// infrastructure/adapters/outbound/NDKProfileAdapter.ts
import NDK, { NDKEvent, NDKRelayList, NDKRelaySet } from '@nostr-dev-kit/ndk'

export class NDKProfileAdapter implements ProfilePort {
  constructor(
    private readonly ndk:         NDK,
    private readonly keyProvider: KeyProvider,
  ) {}

  async fetchRelaySet(pubkey: string): Promise<RelaySet> {
    const user      = this.ndk.getUser({ pubkey })
    const relayList = await NDKRelayList.forUser(user, this.ndk)
    if (!relayList) throw new Error('NIP-65 not found')
    return new RelaySet(
      [...relayList.writeRelayUrls],
      [...relayList.readRelayUrls],
    )
  }

  async publishRelaySet(relaySet: RelaySet, targetRelays: string[]): Promise<void> {
    const event = new NDKEvent(this.ndk, {
      kind:       10002,
      tags:       relaySet.toNIP65Tags(),
      content:    '',
      created_at: Math.floor(Date.now() / 1000),
    } as any)
    await event.sign(this.keyProvider.getNDKSigner())
    await event.publish(NDKRelaySet.fromRelayUrls(targetRelays, this.ndk))
  }

  async fetchDMRelays(pubkey: string): Promise<string[]> {
    const events = await this.ndk.fetchEvents({ kinds: [10050], authors: [pubkey], limit: 1 })
    const event  = [...events][0]
    if (!event) throw new Error('kind 10050 not found')
    return event.tags.filter(t => t[0] === 'relay' && t[1]).map(t => t[1])
  }

  async publishDMRelays(dmRelays: string[], targetRelays: string[]): Promise<void> {
    const event = new NDKEvent(this.ndk, {
      kind:       10050,
      tags:       dmRelays.map(url => ['relay', url]),
      content:    '',
      created_at: Math.floor(Date.now() / 1000),
    } as any)
    await event.sign(this.keyProvider.getNDKSigner())
    await event.publish(NDKRelaySet.fromRelayUrls(targetRelays, this.ndk))
  }

  async fetchProfile(pubkey: string, hintRelays?: string[]): Promise<NostrProfile> {
    const user = this.ndk.getUser({ pubkey })
    await user.fetchProfile()
    const p      = user.profile as (typeof user.profile) & { cs_role?: 'agent' | 'customer' }
    const relays = await this.fetchRelaySet(pubkey).catch(
      () => new RelaySet(hintRelays ?? [], hintRelays ?? []),
    )
    return new NostrProfile(
      pubkey,
      p?.name   ?? '',
      p?.about  ?? '',
      p?.image  ?? '',
      p?.cs_role,
      relays,
    )
  }

  async publishProfile(profile: NostrProfile, targetRelays: string[]): Promise<void> {
    const event = new NDKEvent(this.ndk, {
      kind:    0,
      tags:    [],
      content: JSON.stringify({
        name:    profile.name,
        about:   profile.about,
        picture: profile.picture,
        cs_role: profile.csRole,
      }),
      created_at: Math.floor(Date.now() / 1000),
    } as any)
    await event.sign(this.keyProvider.getNDKSigner())
    await event.publish(NDKRelaySet.fromRelayUrls(targetRelays, this.ndk))
  }
}
```

### 12.4 NDKRelayIndexAdapter (NIP-66)

NIP-66 data is rarely available on ordinary relays, so the adapter must **connect explicitly to monitor relays**.

```typescript
// infrastructure/adapters/outbound/NDKRelayIndexAdapter.ts
import NDK, { NDKEvent, NDKFilter, NDKRelaySet } from '@nostr-dev-kit/ndk'

export class NDKRelayIndexAdapter implements RelayIndexPort {
  private static readonly MONITOR_RELAYS = [
    'wss://relay.nostr.watch',
    'wss://relaypag.es',
  ]

  constructor(private readonly ndk: NDK) {}

  async fetchPublicRelays(filter: RelayIndexFilter = {}): Promise<string[]> {
    const ndkFilter: NDKFilter = {
      kinds: [30166 as number],
      limit: filter.limit ?? 10,
    }
    // NDK only types lowercase '#'-tag filters — cast to any for uppercase 'R'.
    const markers: string[] = []
    if (filter.noPayment) markers.push('!payment')
    if (filter.noAuth)    markers.push('!auth')
    if (markers.length > 0) (ndkFilter as any)['#R'] = markers

    const relaySet = NDKRelaySet.fromRelayUrls(
      NDKRelayIndexAdapter.MONITOR_RELAYS,
      this.ndk,
    )

    return new Promise((resolve) => {
      const urls: string[] = []
      const sub = this.ndk.subscribe(ndkFilter, { closeOnEose: true }, relaySet)

      sub.on('event', (ev: NDKEvent) => {
        const d = ev.tags.find(t => t[0] === 'd')?.[1]
        if (d?.startsWith('wss://')) urls.push(d)
      })
      sub.on('eose', () => resolve(urls))
      setTimeout(() => resolve(urls), 3000)  // monitor-unresponsive timeout
    })
  }
}
```

### 12.5 KeyProvider implementations

```typescript
// infrastructure/adapters/outbound/key-providers/PrivateKeyProvider.ts
import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'

export class PrivateKeyProvider implements KeyProvider {
  private readonly signer: NDKPrivateKeySigner

  constructor(input: { type: 'nsec'; value: string } | { type: 'hex'; value: string }) {
    this.signer = new NDKPrivateKeySigner(input.value)  // accepts both nsec and hex
  }

  async getPubkey(): Promise<string> { return (await this.signer.user()).pubkey }
  getNDKSigner(): NDKPrivateKeySigner { return this.signer }
}

// infrastructure/adapters/outbound/key-providers/NIP07KeyProvider.ts
import { NDKNip07Signer } from '@nostr-dev-kit/ndk'

export class NIP07KeyProvider implements KeyProvider {
  private readonly signer = new NDKNip07Signer()
  async getPubkey(): Promise<string> { return (await this.signer.user()).pubkey }
  getNDKSigner(): NDKNip07Signer { return this.signer }
}

// infrastructure/adapters/outbound/key-providers/NIP46KeyProvider.ts
import NDK, { NDKNip46Signer, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'

/**
 * NDKNip46Signer needs a localSigner (built-in keypair) to sign
 * the bunker-protocol traffic itself.
 */
export class NIP46KeyProvider implements KeyProvider {
  private readonly signer: NDKNip46Signer

  constructor(
    ndk:             NDK,
    connectionToken: string,              // bunker:// or nostrconnect://
    localSigner?:    NDKPrivateKeySigner, // generated on the fly if omitted
  ) {
    const local = localSigner ?? NDKPrivateKeySigner.generate()
    this.signer = new NDKNip46Signer(ndk, connectionToken, local)
  }

  async getPubkey(): Promise<string> { return (await this.signer.user()).pubkey }
  getNDKSigner(): NDKNip46Signer { return this.signer }
}
```

### 12.6 InMemoryEventBus

```typescript
// infrastructure/adapters/outbound/InMemoryEventBus.ts

export class InMemoryEventBus implements EventBusPort {
  private handlers = new Map<CSEvent['type'], Set<(payload: any) => void>>()

  emit(event: CSEvent): void {
    for (const h of this.handlers.get(event.type) ?? []) h(event.payload)
  }

  on<T extends CSEvent['type']>(
    type:    T,
    handler: (payload: Extract<CSEvent, { type: T }>['payload']) => void,
  ): () => void {
    const set = this.handlers.get(type) ?? new Set()
    set.add(handler as any)
    this.handlers.set(type, set)
    return () => set.delete(handler as any)
  }
}
```

---

## 13. `connect()` Overall Flow

```
cs.connect()
  │
  ├─ 1. NDK init — connect to bootstrap relays
  │
  ├─ 2. Build DI container — wire adapters and use cases
  │
  ├─ 3. BootstrapUseCase.execute()
  │      ├─ a. query NIP-66 (kind 30166) against monitor relays
  │      ├─ b. spread = bootstrap ∪ public
  │      ├─ c. publish kind 10002 → spread
  │      ├─ d. publish kind 10050 → spread  (if dm configured)
  │      └─ e. publish kind 0    → spread
  │
  ├─ 4. Run the subscribe use case — start listening based on role
  │      ├─ customer: SubscribeAsCustomerUseCase
  │      └─ agent:    SubscribeAsAgentUseCase
  │
  └─ 5. Ready
```

Publish-time routing:

```
ticket / reply / status (kind 7700–7704)
  → RelayDiscoveryService.getPublishRelays(recipient)
      → recipient's kind 10002 read  | bootstrap

DM (kind 1059)
  → RelayDiscoveryService.getDMRelays(recipient)
      → recipient's kind 10050  | kind 10002 read  | bootstrap
```

---

## 14. CSClient Facade

```typescript
// CSClient.ts
import NDK from '@nostr-dev-kit/ndk'

export type KeyInput =
  | { type: 'nsec';   value: string }
  | { type: 'hex';    value: string }
  | { type: 'signer'; value: KeyProvider }

export interface RelayConfig {
  bootstrap: [string, ...string[]]
  write?:    string[]
  read?:     string[]
  dm?:       string[]
}

export interface CSClientConfig {
  key:     KeyInput
  relays:  RelayConfig
  profile?: {
    name:   string
    csRole: 'agent' | 'customer'
  }
}

interface DIContainer {
  ndk:                        NDK
  eventBus:                   EventBusPort
  createTicketUseCase:        CreateTicketUseCase
  replyTicketUseCase:         ReplyTicketUseCase
  updateStatusUseCase:        UpdateStatusUseCase
  sendDMUseCase:              SendDMUseCase
  internalNoteUseCase:        InternalNoteUseCase
  submitCsatUseCase:          SubmitCsatUseCase
  subscribeAsCustomerUseCase: SubscribeAsCustomerUseCase
  subscribeAsAgentUseCase:    SubscribeAsAgentUseCase
  bootstrapUseCase:           BootstrapUseCase
}

function resolveRelayConfig(cfg: RelayConfig): ResolvedRelayConfig {
  return {
    bootstrap: [...cfg.bootstrap],
    write:     cfg.write ?? [...cfg.bootstrap],
    read:      cfg.read  ?? [...cfg.bootstrap],
    dm:        cfg.dm    ?? cfg.read ?? [...cfg.bootstrap],
  }
}

export class CSClient {
  private readonly keyProvider: KeyProvider
  private container: DIContainer | null = null

  constructor(private readonly config: CSClientConfig) {
    this.keyProvider = config.key.type === 'signer'
      ? config.key.value
      : new PrivateKeyProvider(config.key)
  }

  async connect(): Promise<void> {
    const resolved  = resolveRelayConfig(this.config.relays)
    this.container  = await buildContainer(this.keyProvider, resolved, this.config.profile)

    await this.container.bootstrapUseCase.execute()

    // Auto-subscribe based on role
    if (this.config.profile?.csRole === 'agent') {
      await this.container.subscribeAsAgentUseCase.execute()
    } else {
      await this.container.subscribeAsCustomerUseCase.execute()
    }
  }

  async disconnect(): Promise<void> {
    this.container?.subscribeAsAgentUseCase.stop()
    this.container?.subscribeAsCustomerUseCase.stop()
    // NDK 2.x: close all relay connections via the pool
    this.container?.ndk.pool.disconnect()
  }

  // ── Customer ──
  createTicket(p: CreateTicketParams): Promise<Ticket> {
    return this.container!.createTicketUseCase.execute(p)
  }
  sendMessage(p: SendMessageParams): Promise<void> {
    return this.container!.sendDMUseCase.execute(p)
  }
  submitCsat(p: SubmitCsatParams): Promise<void> {
    return this.container!.submitCsatUseCase.execute(p)
  }

  // ── Agent ──
  replyTicket(p: ReplyParams): Promise<void> {
    return this.container!.replyTicketUseCase.execute(p)
  }
  updateStatus(p: UpdateStatusParams): Promise<void> {
    return this.container!.updateStatusUseCase.execute(p)
  }
  addInternalNote(p: InternalNoteParams): Promise<void> {
    return this.container!.internalNoteUseCase.execute(p)
  }

  // ── Subscriptions ──
  onTicket(h:       (t: Ticket) => void):        () => void { return this.container!.eventBus.on('ticket:created',   h) }
  onReply(h:        (r: TicketReply) => void):   () => void { return this.container!.eventBus.on('ticket:reply',     h) }
  onNote(h:         (r: TicketReply) => void):   () => void { return this.container!.eventBus.on('ticket:note',      h) }
  onStatusChange(h: (u: StatusUpdate) => void):  () => void { return this.container!.eventBus.on('status:changed',   h) }
  onMessage(h:      (m: Message) => void):       () => void { return this.container!.eventBus.on('message:received', h) }
  onCsat(h:         (c: CsatResponse) => void):  () => void { return this.container!.eventBus.on('csat:submitted',   h) }
}
```

`buildContainer` (in `infrastructure/di/container.ts`) creates the NDK instance (including bootstrap relays) and assembles every adapter and use case.

---

## 15. Public Export (index.ts)

```typescript
export { CSClient } from './CSClient'

export { PrivateKeyProvider } from './infrastructure/adapters/outbound/key-providers/PrivateKeyProvider'
export { NIP07KeyProvider }   from './infrastructure/adapters/outbound/key-providers/NIP07KeyProvider'
export { NIP46KeyProvider }   from './infrastructure/adapters/outbound/key-providers/NIP46KeyProvider'

// Ports — for custom implementations
export type { KeyProvider, UnsignedEvent, SignedEvent, SubscriptionFilter, Subscription } from './application/ports/outbound/NostrEventPort'
export type { CryptoPort }     from './application/ports/outbound/CryptoPort'
export type { NostrEventPort } from './application/ports/outbound/NostrEventPort'
export type { ProfilePort }    from './application/ports/outbound/ProfilePort'
export type { EventBusPort }   from './application/ports/outbound/EventBusPort'

// Domain
export { TicketId } from './domain/value-objects/TicketId'
export type { Ticket }        from './domain/entities/Ticket'
export type { Message }       from './domain/entities/Message'
export type { TicketReply }   from './domain/entities/TicketReply'
export type { StatusUpdate }  from './domain/entities/StatusUpdate'
export type { CsatResponse }  from './domain/entities/CsatResponse'
export type { TicketStatus }  from './domain/value-objects/TicketStatus'
export type { Priority }      from './domain/value-objects/Priority'
export type { Category }      from './domain/value-objects/Category'

// Parameters
export type {
  CSClientConfig, RelayConfig, KeyInput,
  CreateTicketParams, ReplyParams, UpdateStatusParams,
  SendMessageParams, InternalNoteParams, SubmitCsatParams,
} from './CSClient'
```

---

## 16. Usage Examples

```typescript
import { CSClient, NIP07KeyProvider } from 'nostr-cs'

// ── Minimal config ───────────────────────────
const cs = new CSClient({
  key:    { type: 'nsec', value: 'nsec1...' },
  relays: { bootstrap: ['wss://relay.damus.io'] },
  profile: { name: 'Alice', csRole: 'customer' },
})

// ── Role-separated config ────────────────────
const agent = new CSClient({
  key: { type: 'nsec', value: 'nsec1...' },
  relays: {
    bootstrap: ['wss://relay.damus.io'],
    write:     ['wss://nos.lol'],
    read:      ['wss://relay.damus.io'],
    dm:        ['wss://inbox.nostr.wine'],
  },
  profile: { name: 'Support team', csRole: 'agent' },
})

// ── Browser extension ────────────────────────
const ext = new CSClient({
  key:     { type: 'signer', value: new NIP07KeyProvider() },
  relays:  { bootstrap: ['wss://relay.damus.io'] },
  profile: { name: 'Alice', csRole: 'customer' },
})

await cs.connect()  // NIP-66 → 10002 spread → 10050 spread → kind 0 → subscribe

// Subscriptions are started automatically inside connect()
cs.onTicket(t       => console.log('new ticket:',   t.id.toString(), t.title))
cs.onReply(r        => console.log('reply:',        r.body))
cs.onStatusChange(u => console.log('status change:', u.newStatus))
cs.onMessage(m      => console.log(m.channel, m.body))

// Create a ticket
const ticket = await cs.createTicket({
  title:       'Payment error inquiry',
  body:        'My payment keeps failing...',
  agentPubkey: 'agent_pubkey_hex',
  priority:    'high',
  category:    'billing',
})

// Send a DM
await cs.sendMessage({
  ticketId:        ticket.id,
  threadRoot:      ticket.eventId,
  content:         'Could you provide more details, please?',
  recipientPubkey: ticket.agentPubkey,
})

await cs.disconnect()
```

---

## 17. Full Scenario (customer AAA → agent BBB)

```
Assumptions:
  customer AAA  /  agent BBB
  bootstrap: wss://relay.damus.io

━━━ STEP 0. agent warm-up ━━━
BBB.connect()
  ├─ query NIP-66 (monitor relay) → public relays
  ├─ kind 10002 → spread    write:[nos.lol], read:[damus.io]
  ├─ kind 10050 → spread    dm:[inbox.nostr.wine]
  ├─ kind 0     → spread    cs_role:"agent"
  └─ SubscribeAsAgent       kinds:[7700,7703,7704,1059] "#p":[BBB]

━━━ STEP 1. customer connect() ━━━
AAA.connect()
  ├─ query NIP-66
  ├─ kind 10002 → spread    write+read:[damus.io]
  ├─ kind 0     → spread    cs_role:"customer"
  └─ SubscribeAsCustomer    kinds:[7701,7702,1059] "#p":[AAA]

━━━ STEP 2. customer → create ticket ━━━
AAA.createTicket({ agentPubkey: BBB })
  ├─ RelayDiscovery.getPublishRelays(BBB) = BBB's 10002.read
  ├─ NIP-44 encrypt(content, BBB)
  └─ kind 7700 publish → BBB.read

━━━ STEP 3. agent receives ━━━
BBB's subscription picks up kind 7700
  └─ decrypt → Ticket entity → eventBus.emit('ticket:created')

━━━ STEP 4. agent → move status to in_progress ━━━
BBB.updateStatus({ customerPubkey: AAA })
  └─ kind 7701 publish → AAA.read
AAA's subscription picks it up → emit('status:changed')

━━━ STEP 5. agent → DM ━━━
BBB.sendMessage({ recipientPubkey: AAA })
  ├─ getDMRelays(AAA) = AAA.10050 | AAA.10002.read | bootstrap
  ├─ sealAndWrap(rumor, AAA) → kind 1059 SignedEvent
  └─ publish → AAA's DM relay
AAA's subscription picks up kind 1059 → unwrap → emit('message:received')

━━━ STEP 6. close ━━━
BBB → kind 7701 (resolved)
AAA → kind 7704 (rating 5)
```

---

## 18. Dependency Direction

```
user
  └─→ CSClient (facade)
        ├─→ CustomerPort / AgentPort (inbound)
        │     └─→ UseCase (publish / subscribe)
        │           ├─→ NostrEventPort  → NDKRelayAdapter       → NDK → relay
        │           ├─→ CryptoPort      → NDKCryptoAdapter      → NDK nip44/nip17
        │           ├─→ ProfilePort     → NDKProfileAdapter     → NDK (kind 0/10002/10050)
        │           ├─→ RelayIndexPort  → NDKRelayIndexAdapter  → NDK (NIP-66, monitors)
        │           ├─→ KeyProvider     → Private/NIP07/NIP46Provider → NDKSigner
        │           ├─→ EventBusPort    → InMemoryEventBus
        │           └─→ RelayDiscoveryService (domain, depends only on ports)
        └─→ Domain Core (pure — no external dependencies)

External library: @nostr-dev-kit/ndk only
```

---

## 19. v7.1 Change Log (vs v7)

- **[A1]** Removed `ndk: NDK` from every use case's constructor — they now depend only on ports
- **[A2]** `NostrEventPort.publish(raw, targetRelays)` — routing actually works
- **[A3]** Added dedicated subscribe use cases (§11); introduced `EventBusPort` + `InMemoryEventBus`
- **[A4]** Aligned with NDK 2.x APIs — `subscribe` signature, `pool.disconnect()`, `NDKNip46Signer` localSigner, real NIP-17 gift-wrap integration
- **[A5]** Dropped `crypto.createHash` (UUIDv7 means no hashing is required)
- **[B1]** Hash-based `ticket_id` → UUIDv7
- **[C1]** Defined every missing entity / DTO (`Ticket.customerPubkey` added; `Message / TicketReply / StatusUpdate / CsatResponse` introduced; `ResolvedRelayConfig` / `DIContainer` made explicit)
- **[C2]** Removed the `seq` parameter
- **[D1]** Section numbering cleaned up (11 was missing; 9 / 12 / 16 were duplicated)
- **[D2]** `MONITOR_RELAYS` is actually used (explicit connection)
- **[D3]** Clarified the relationship between kind 14 and kind 1059

---

*Design baseline: 2024-04-24 (refreshed for v7.1)*  
*`@nostr-dev-kit/ndk`-only / NIP-17 / NIP-44 / NIP-65 / NIP-66 / Hexagonal / ESM*
