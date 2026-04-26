# nostr-cs

> [!WARNING]
> This project is in early development. Protocol details, APIs, and
> package layout can change without notice. Not ready for production use.

Customer support over Nostr. Reach a support agent by their **pubkey**,
not a vendor account. End-to-end encrypted via NIP-44 + NIP-17; no SaaS
ticket DB, no DNS, no vendor lock-in. Tickets, replies, status changes,
internal notes, CSAT — all plain Nostr events on relays you choose.

```
   your customer app           public relay (ws)         your agent app
 ┌────────────────────┐                                ┌────────────────────┐
 │ ┌──── SDK ───────┐ │   NIP-44 body / NIP-17 wrap    │ ┌──── SDK ───────┐ │
 │ │ createTicket   │─┼─── 7700 ticket ──────────────▶ │ │ onTicket       │ │
 │ │ sendMessage    │─┼─── 1059 DM ──────────────────▶ │ │ replyTicket    │ │
 │ │ on* handlers   │◀┼─── 7702 reply / 7701 status ── │ │ updateStatus   │ │
 │ └────────────────┘ │                                │ └────────────────┘ │
 │ + your UI          │                                │ + your UI          │
 └────────────────────┘                                └────────────────────┘

  The SDK handles encryption, gift wrap, relay routing, subscription
  filters, and persistence. You write only the UI — PWA, React Native,
  Tauri, CLI, or embedded inside a product you already ship. Customer
  support becomes an embeddable feature, not a separate service.
```

Both sides are apps you build with the same SDK. There's no central
service to deploy — every ticket interaction is a Nostr event on a
relay you (or your counterpart) pick:

```
 ┌────────────┐
 │  web PWA   │   NIP-44 body / NIP-17 wrap     ┌────────┐
 │ mobile app │ ─── ticket / reply / DM ──────▶ │ public │
 │  desktop   │                                 │ relay  │
 │    CLI     │ ◀── status / reply / DM ─────── │  (wss) │
 └────────────┘                                 └────────┘
   identity = npub you control                  no DB, no auth provider,
   relays = your choice (multiple)              no agent platform service
```

The same intuition behind running a service as a Telegram bot — get a
callable address without exposing your real backend — applied to
customer support: every ticket is a signed event delivered by a relay,
identity is a keypair, and "switching providers" is a relay URL change.

## Why

```
 vendor SaaS stack:                       with nostr-cs:
 ──────────────────                       ──────────────

 customer ──HTTPS──▶ Zendesk    (vendor)  customer ──HTTPS──▶ CDN  (rented)
                                                              │
 agent    ──HTTPS──▶ Zendesk    (vendor)  customer ──NIP-44──▶ relay
                                                              │
 vendor owns:                                                 ▼
   · ticket DB                                            agent PWA
   · authentication                                       ─────────
   · audit trail                                           · npub identity
   · search index                                          · no inbound port
   · pricing model                                         · multi-relay
                                                           · BYO storage
```

Traditional CS couples ticket **identity** to **a vendor account**: you
log into `tenant.zendesk.com`, agents are users in their RBAC, the
thread lives in their database, and migration means CSV exports.

nostr-cs decouples the two:
- **Identity** = Nostr pubkey (self-certifying, no vendor)
- **Storage** = a Nostr relay you pick (swappable, multiple at once)
- **Threads** = signed events you can fan out to your own relay

A customer needs only an agent's pubkey + one relay URL to open a
ticket. Agents authenticate by signing events. If a relay
disappears or starts charging, point the client at another — pubkey
and old threads (replicated to other relays you trust) keep working.

Events use **plaintext `#p` tags** for routing — both pubkeys are
visible to relays. Bodies are NIP-44 encrypted; NIP-17 DMs hide
the sender. See [`docs/MESSAGE-ENVELOPE.md`](docs/MESSAGE-ENVELOPE.md)
for the wire format and metadata exposure details.

## What you write

A normal SDK call. Wrap/unwrap, NIP-44 body encryption, gift-wrap, and
relay routing live behind the facade.

```ts
// customer side
const ticket = await client.createTicket({
  title: 'Login broken',
  body: 'gets stuck after OTP',
  agentPubkey: AGENT_PUBKEY,
  priority: 'high',
  category: 'technical',
})
client.onReply((r) => render(r))

// agent side
client.onTicket(async (t) => {
  await client.replyTicket({
    ticketId: t.id, threadRoot: t.eventId,
    body: 'Looking into it.',
    customerPubkey: t.customerPubkey,
  })
})
```

- **Domain code only.** Handlers receive `Ticket` / `Message` /
  `TicketReply` domain objects. NIP-17 gift wrap, NIP-44 conversation
  keys, relay subscription filters — all behind ports.
- **Two channels, one API.** Public ticket thread (kind 7702 reply,
  encrypted to customer) and private NIP-17 DM (kind 1059, sender
  hidden) on the same handler.
- **Reachable on any client implementing the kinds.** Other clients
  speaking the same kinds interop without coordination.

## Positioning

|  | Zendesk / Intercom | Discord / Telegram bot | Email + SMTP | **nostr-cs** |
|---|---|---|---|---|
| Identity | vendor account | vendor account | mailbox + SPF/DKIM | **Nostr pubkey** |
| Storage owner | vendor | vendor | mail server operator | **relay you pick** |
| End-to-end encryption | no (vendor sees plaintext) | no | optional (PGP, rare) | **yes (NIP-44 / NIP-17)** |
| Vendor lock-in | high (CSV export) | medium (export tools) | low (mbox/IMAP) | **none** |
| Multi-agent | built in | manual | shared mailbox | **roadmap** |
| Custom domain / branding | paid tier | bot username | yes | **client-owned UI** |
| Attachment privacy | TLS to vendor only | TLS to vendor only | sender's mail server | **client-side AES-256-GCM + Blossom** |
| Pricing | per-seat | bot platform fees | server cost | **relay cost (typically free / sats)** |

nostr-cs is not a Zendesk replacement for orgs that need RBAC,
SLA dashboards, and integration marketplaces today. It's the
"TLS + vendor account replaced by pubkey + relay" rebuild — useful
when keeping the thread on infra you own matters more than features
you'd buy.

## Protocol at a glance

| kind | role | encryption | who emits |
|---|---|---|---|
| 7700 | ticket creation | NIP-44 body to agent | customer |
| 7701 | status change | plaintext `status` tag | agent |
| 7702 | public thread reply | NIP-44 body to customer | agent |
| 7703 | internal note | NIP-44 body, per recipient | agent |
| 7704 | CSAT response | NIP-44 body to agent (rating + comment private) | customer |
| 14 / 13 / 1059 | NIP-17 rumor / seal / gift wrap (DMs) | gift-wrap, sender hidden | both |
| 0 / 10002 / 10050 / 10166 | profile / NIP-65 / NIP-17 relay list / NIP-66 monitor | standard | both |
| 30078 | NIP-78 app data (e.g. ephemeral keyring) | NIP-44 self | client-side state |

Wire envelope schema (text + encrypted attachments) is documented in
[`docs/MESSAGE-ENVELOPE.md`](docs/MESSAGE-ENVELOPE.md).

## Architecture

Hexagonal. The domain core (`CSClient` facade + use cases + entities)
depends only on port interfaces. Concrete Nostr libraries plug in at
the composition root.

```
                    ports (contracts)
                          ▲
              ┌───────────┴───────────┐
              │   CSClient (facade)   │
              │   + 9 use cases       │
              │   + domain entities   │
              └───────────────────────┘
                          ▲
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
 ┌────────────┐   ┌─────────────┐   ┌────────────────┐
 │  inbound   │   │  outbound   │   │ infrastructure │
 │  ports     │   │  ports      │   │ adapters       │
 │ ─────────  │   │ ──────────  │   │ ─────────────  │
 │ Customer   │   │ NostrEvent  │   │ SimplePool *   │
 │ Agent      │   │ Crypto      │   │ Nip59Crypto    │
 │            │   │ KeyProvider │   │ PrivateKey *   │
 │            │   │ Profile     │   │ NIP07 / NIP46  │
 │            │   │ RelayIndex  │   │ InMemoryBus    │
 │            │   │ EventBus    │   │                │
 └────────────┘   └─────────────┘   └────────────────┘
                          ▼
                   Nostr relay (WebSocket)
```

Default adapter set is nostr-tools `SimplePool` for relay traffic and
`nip44.v2` + `nip59` for crypto. The port layout makes NDK or other
implementations a drop-in swap at the composition root.

## Stack

- [Bun](https://bun.sh) ≥ 1.1 (runtime, test, package manager)
- TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`)
- [nostr-tools](https://github.com/nbd-wtf/nostr-tools) ≥ 2.23
- [SvelteKit](https://kit.svelte.dev) + [Tailwind](https://tailwindcss.com) (example PWA only)

## Try it

Run the example PWA — no local relay required, uses public Nostr relays
by default.

```bash
bun install
cd example/pwa
cp .env.example .env
bun run dev
# → http://localhost:5173
```

Open in two browser windows (or two devices):
1. First window — Setup → "Generate New Key" → pick role: **agent** → connect. Copy the agent npub from Settings.
2. Second window — Setup → "Generate New Key" → pick role: **customer** → connect. Open "New Ticket", paste the agent npub.

Replies / DMs / status changes / CSAT round-trip live over relays.

## Usage

```ts
import { CSClient } from 'nostr-cs'

const client = new CSClient({
  key: { type: 'nsec', value: 'nsec1...' },           // or NIP-07 / NIP-46 signer
  relays: { bootstrap: ['wss://relay.damus.io'] },
  profile: { name: 'Alice', csRole: 'customer' },     // or 'agent'
})
await client.connect()
```

### Advanced relay infrastructure

`CSClient` creates its own `SimplePool` and public relay discovery adapter by
default. Host apps that already manage Nostr relay connections can inject those
dependencies instead:

```ts
import { CSClient, type RelayIndexPort } from 'nostr-cs'

const relayIndex: RelayIndexPort = {
  fetchPublicRelays: async () => ['wss://relay.example'],
}

const client = new CSClient({
  key: { type: 'signer', value: keyProvider },
  relays: { bootstrap: ['wss://relay.example'] },
  infrastructure: {
    pool: sharedSimplePool,
    relayIndex,
  },
})
```

When a pool is injected, `disconnect()` stops SDK subscriptions but does not
destroy the external pool. This lets apps share WebSocket connections and
control which discovery sources are queried while preserving the default SDK
behavior for simple integrations.

An external pool must be paired with an explicit `relayIndex`. This prevents a
host app from accidentally sending public relay discovery queries to the SDK's
default monitor relays through a shared pool. If you only need custom public
relay discovery and do not need pool sharing, inject `relayIndex` without
`pool`.

### Customer

```ts
await client.createTicket({
  title, body, agentPubkey,
  priority: 'high', category: 'technical',
})
await client.sendMessage({                            // private NIP-17 DM
  ticketId, threadRoot, content,
  recipientPubkey: agentPubkey,
})
await client.submitCsat({
  ticketId, threadRoot, agentPubkey,
  rating: 5, comment: 'Fast resolution',
})
```

### Agent

```ts
await client.replyTicket({                            // public thread reply
  ticketId, threadRoot, body,
  customerPubkey,
})
await client.updateStatus({
  ticketId, threadRoot,
  newStatus: 'resolved',
  customerPubkey,
})
await client.addInternalNote({                        // encrypted to other agents
  ticketId, threadRoot, body,
  otherAgentPubkeys: [...],
})
```

### Subscriptions (both roles)

```ts
client.onTicket((t) => ...)
client.onReply((r) => ...)
client.onNote((n) => ...)
client.onStatusChange((u) => ...)
client.onMessage((m) => ...)
client.onCsat((c) => ...)
```

### Persistence + cross-device sync

```ts
// Generic NIP-78 (kind 30078) — encrypted to self, syncs via relays.
await client.appDataSave('drafts', JSON.stringify({...}))
const drafts = await client.appDataLoad('drafts')

// Back-fill self-authored events the role's #p:[me] subscription misses
// (e.g. a customer's own kind-7700 tickets on a fresh device).
await client.pullOwnHistory()
```

## Develop

```bash
bun install
bun run typecheck         # tsc --noEmit
bun test                  # unit tests (61)
bun run e2e:smoke         # round-trip against local docker relay
bun run e2e:full          # 6-step §17 scenario (customer + agent + peer agent)
```

The E2E harness spawns `scsibug/nostr-rs-relay` via Docker on
`localhost:17777` and tears it down on exit.

Environment configuration (PWA only):

| var | purpose |
|---|---|
| `PUBLIC_BOOTSTRAP_RELAYS` | comma-separated wss URLs for kind 0 / 10002 / 10050 lookup |
| `PUBLIC_WRITE_RELAYS` | publish targets (default: bootstrap) |
| `PUBLIC_READ_RELAYS` | subscription targets (default: bootstrap) |
| `PUBLIC_DM_RELAYS` | NIP-17 DM relays (default: read) |
| `PUBLIC_BLOSSOM_SERVERS` | Blossom servers for encrypted attachments |

## Examples

- [`example/pwa`](example/pwa) — dual-role customer + agent PWA.
  SvelteKit + Tailwind, Industrial Sage Material 3 tokens, encrypted
  Blossom attachments with NIP-78 ephemeral keyring, optimistic
  publish, localStorage cache + cross-device pull.
- [`example/design_example`](example/design_example) — original UI
  mockups (HTML + screenshots) the PWA was built against.

## Docs

- [`docs/MESSAGE-ENVELOPE.md`](docs/MESSAGE-ENVELOPE.md) — wire envelope (v1) spec for the body field of 7700 / 7702 / 7703 and NIP-17 rumor content. Defines the encrypted-attachment schema.
- [`cs-nostr-hexagonal-v7.md`](cs-nostr-hexagonal-v7.md) — original protocol + architecture spec the framework was built from.

## Roadmap

- Multi-agent: roster events, claim / handoff, derived current-assignee
- Wire format flatten (envelope v2): drop the inner JSON-string layer
- Decoy traffic / padding for `#p` metadata reduction
- Public registry of agent pubkeys (NIP-89 / custom directory)

## License

[MIT](LICENSE).
