---
'nostr-cs': patch
---

Encrypt CSAT (kind 7704) body to the agent.

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
