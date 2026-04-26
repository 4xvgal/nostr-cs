---
'nostr-cs': patch
---

Initial release.

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
