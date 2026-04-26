# Message Envelope (v1)

Specification of the plaintext payload that nostr-cs places inside the
encrypted body of its custom kinds, and inside NIP-17 DM rumor content.

This is the **wire-level contract** between nostr-cs clients. The framework
exports both the types and the codec — see `encodeEnvelope` / `decodeEnvelope`
in [`src/application/codec/envelope.ts`](../src/application/codec/envelope.ts).

## 1. Wire location

After NIP-44 decryption of the parent event content, the framework's outer
wrappers are:

| Kind | Outer wrapper after NIP-44 decrypt |
|------|------------------------------------|
| 7700 (ticket creation) | `{"ticket_id": "...", "title": "...", "body": "<envelope>"}` |
| 7702 (public reply) | `{"body": "<envelope>"}` |
| 7703 (internal note) | `{"ticket_id": "...", "body": "<envelope>"}` |
| NIP-17 rumor (kind 14) | rumor.content = `<envelope>` |

`<envelope>` is one of:
- A JSON-stringified [`MessageEnvelope`](#3-schema-v1) — the canonical form
- An arbitrary plain-text string — the legacy / non-conforming peer fallback

Parsers MUST handle both.

## 2. Why a string-in-string?

Outer wrappers are JSON objects whose `body` field is a string. This keeps
backward compatibility with peers that emit plain text. Trade-off: the inner
envelope is JSON-stringified, so a recipient runs two `JSON.parse` calls in
the worst case (outer + envelope). Future revisions may flatten this if a
breaking change is otherwise warranted.

## 3. Schema (v1)

```jsonc
{
  "v": 1,
  "text": "Hello, here's the screenshot",
  "attachments": [
    {
      "type": "encrypted_blob",
      "mime": "image/jpeg",
      "name": "screenshot.png",
      "size": 12345,
      "sha256": "<hex sha256 of plaintext>",
      "cipher": "aes-256-gcm",
      "key": "<base64 of 32-byte AES key>",
      "iv":  "<base64 of 12-byte AES-GCM IV>",
      "blossom": {
        "blob_sha256": "<hex sha256 of ciphertext (Blossom blob id)>",
        "servers": ["https://blossom.example", "https://mirror.example"]
      }
    }
  ]
}
```

### `MessageEnvelope`

| Field | Type | Required | Notes |
|------|------|----------|-------|
| `v` | `1` | yes | Version literal. v1 parsers MUST reject any other value's `attachments`. |
| `text` | string | yes | UTF-8 message body. May be empty if attachments-only. |
| `attachments` | `EncryptedAttachment[]` | yes | May be empty. |

### `EncryptedAttachment`

| Field | Type | Required | Notes |
|------|------|----------|-------|
| `type` | `"encrypted_blob"` | yes | Discriminator. v1 defines this single variant. Unknown `type` MUST be ignored. |
| `mime` | string | yes | MIME type of the *plaintext* — informs how to render after decrypt. |
| `name` | string | no | UI hint only; not authoritative. |
| `size` | number | yes | Plaintext byte length. |
| `sha256` | hex string | yes | sha256 of the plaintext. Recipients MUST verify post-decrypt. |
| `cipher` | `"aes-256-gcm"` | yes | Encryption algorithm. |
| `key` | base64 | yes | Raw 32-byte AES key. Per-blob, never reused. |
| `iv` | base64 | yes | 12-byte AES-GCM IV, randomly generated per encryption. |
| `blossom.blob_sha256` | hex string | yes | sha256 of the *ciphertext* — used as the Blossom blob id. |
| `blossom.servers` | string[] | yes | Mirror hints. Clients try in order. |

## 4. Required parser behaviour

A v1-conforming parser MUST:

1. Attempt `JSON.parse` on the `body` string (or rumor.content).
2. If parsing fails OR the result is not an object → treat the entire input as plain text. Return `{v:1, text: <input>, attachments: []}`.
3. If the object has no `v` field → same plain-text fallback (the JSON might be a peer's freeform structure unrelated to envelopes).
4. If `v === 1` → extract `text` (as string, default `""`), filter `attachments` to those passing schema validation, return.
5. If `v > 1` → forward-compat path: extract `text` if present (string), drop `attachments` entirely. Future schema versions may redefine attachment shape; v1 parsers cannot safely interpret them.

## 5. Required sender behaviour

A v1-conforming sender MUST:

- Always set `v: 1` when emitting envelopes.
- Always produce well-formed JSON when including any `attachments`.
- MAY skip the envelope and emit raw plain text when sending text-only messages — the receiving parser's plain-text fallback handles this.
- MUST verify that `key`, `iv`, and `blossom.blob_sha256` are correctly populated before publishing — recipients have no recovery path if the metadata is wrong.

## 6. Encryption details

- **Algorithm**: AES-256-GCM via Web Crypto API (`subtle.encrypt({name:'AES-GCM', iv}, key, plaintext)`).
- **Key**: 32-byte raw key, generated per-blob with `crypto.getRandomValues`. Never reused across blobs.
- **IV**: 12 bytes, generated per encryption with `crypto.getRandomValues`.
- **Auth tag**: appended to ciphertext by browser default (GCM standard). Verified during `decrypt` — if tampered, `decrypt` throws.
- **Defense in depth**: the entire envelope is wrapped again by NIP-44 inside the parent event's content. The AES key sitting in `key` is never visible to relays — only the recipient (who can decrypt the NIP-44 outer layer) ever sees it.

## 7. Storage layer (v1: Blossom)

v1 defines `blossom` as the only storage descriptor. Uploads SHOULD use a
fresh ephemeral Nostr key per blob (BUD-01 auth event signed by the
ephemeral key) so the storage server only sees a disposable identity, not
the user's main pubkey.

The ephemeral nsec required for future DELETE operations is the sender's
responsibility to persist. nostr-cs's reference PWA persists it via a
NIP-78 (kind 30078) self-encrypted keyring under d-tag
`"blossom-eph-keys"` — this is recommended but not required by the
envelope spec.

## 8. Size guidance

- Single attachment plaintext: ≤ 100 MB. Web Crypto's one-shot AES-GCM
  loads the plaintext into memory; large files cause GC pressure.
- Attachments per envelope: ≤ 10. Practical UX cap.
- Larger transfers: split, or use an external link with a separate
  out-of-band trust mechanism (future `link` type).

Wire-side, relay event size limits (commonly 64–256 KB) bound the envelope
JSON itself — keep `text` reasonable; the heavy bytes are in the linked
Blossom blobs, not in the event.

## 9. Type extension

`type` is closed in v1 — the only valid value is `"encrypted_blob"`.

Future variants (under consideration):

- `link` — plaintext URL with optional preview hint (no encryption).
- `signed_url` — pre-signed external CDN reference with expiry.
- `quote` — reference to another nostr-cs event (id + relay hint).

When a new variant is added, the spec major version stays at 1 if existing
fields are unchanged; v1 parsers MUST drop unknown `type` values silently.
A breaking change to `EncryptedAttachment` would bump the envelope `v` to 2.

## 10. Versioning policy

- v1 covers everything in this document.
- Additions that don't break existing fields → still v1.
- Breaking changes to any v1 field → bump to v2. Old `v: 1` content remains
  parseable by v2 clients; new `v: 2` content is partially parseable by v1
  clients (text only, attachments dropped — see §4 step 5).

## 11. Reference implementation

- Codec: [`src/application/codec/envelope.ts`](../src/application/codec/envelope.ts) (framework)
- PWA renderer: [`example/pwa/src/lib/components/MessageBody.svelte`](../example/pwa/src/lib/components/MessageBody.svelte)
- PWA composer attachment flow: [`example/pwa/src/lib/components/AttachmentPicker.svelte`](../example/pwa/src/lib/components/AttachmentPicker.svelte)
- Blossom client: [`example/pwa/src/lib/blossom/client.ts`](../example/pwa/src/lib/blossom/client.ts)
- Ephemeral keyring (NIP-78 / kind 30078): [`example/pwa/src/lib/blossom/keyring.ts`](../example/pwa/src/lib/blossom/keyring.ts)
