# nostr-cs

## 0.0.2

### Patch Changes

- 08eb1eb: Encrypt CSAT (kind 7704) body to the agent.

  Previously the `rating` tag and `comment` content were both relay-visible
  plaintext. They now travel inside a NIP-44-encrypted JSON body
  (`{"rating": 1-5, "comment": string}`) addressed to the agent, so only
  the agent (and the customer themselves, via NIP-44 conversation-key
  symmetry) can read them. The `rating` tag is no longer published;
  routing still uses `#p:[agent]` and the `ticket_id` / thread-root tags.

  Public API surface (`SubmitCsatParams`, `CsatResponse`, `submitCsat`,
  `onCsat`) is unchanged — consumer code is not affected. Internal
  changes:

  - `SubmitCsatUseCase` constructor now takes a `CryptoPort`
  - `SubscribeAsAgentUseCase` decrypts the 7704 body before validating
  - `PullOwnHistoryUseCase` adds 7704 to the customer's pull list so a
    fresh-device customer can recover their own past CSATs (NIP-44
    symmetry lets the sender decrypt)

  Wire-format note: 7704 events emitted by older builds carry plaintext
  content and can't be read by the new subscriber. No shipped versions
  to worry about at this point.

## 0.0.1

### Patch Changes

- c403ea1: Initial release.

  - `CSClient` facade with 3 key-input options (nsec/hex, NIP-07, NIP-46)
  - 9 use cases across publish, subscribe, pull, app-data, and bootstrap
  - Custom kinds 7700–7704 (ticket / status / reply / note / CSAT) on top of
    NIP-44 body encryption + NIP-17 gift-wrapped DMs
  - NIP-65 / NIP-17 / NIP-66 relay discovery with bootstrap fallback
  - NIP-78 (kind 30078) generic app-data store via `appDataSave/Load`
  - `pullOwnHistory` to back-fill self-authored events on fresh devices
  - Hexagonal architecture: 6 outbound + 2 inbound ports, default
    `nostr-tools` SimplePool adapter set
  - Message envelope codec (`docs/MESSAGE-ENVELOPE.md`) with v1 spec for
    text + AES-256-GCM-encrypted attachment metadata

## 0.0.0-20260426031355

### Patch Changes

- Initial release.

  - `CSClient` facade with 3 key-input options (nsec/hex, NIP-07, NIP-46)
  - 9 use cases across publish, subscribe, pull, app-data, and bootstrap
  - Custom kinds 7700–7704 (ticket / status / reply / note / CSAT) on top of
    NIP-44 body encryption + NIP-17 gift-wrapped DMs
  - NIP-65 / NIP-17 / NIP-66 relay discovery with bootstrap fallback
  - NIP-78 (kind 30078) generic app-data store via `appDataSave/Load`
  - `pullOwnHistory` to back-fill self-authored events on fresh devices
  - Hexagonal architecture: 6 outbound + 2 inbound ports, default
    `nostr-tools` SimplePool adapter set
  - Message envelope codec (`docs/MESSAGE-ENVELOPE.md`) with v1 spec for
    text + AES-256-GCM-encrypted attachment metadata
