/**
 * Message envelope (v1).
 *
 * Defines the structure of plaintext content placed inside encrypted bodies of
 * nostr-cs custom kinds (7700 ticket / 7702 reply / 7703 internal note) and
 * inside NIP-17 DM rumor content (kind 14).
 *
 * The framework's existing use cases keep `body: string` parameters opaque —
 * callers are expected to use {@link encodeEnvelope} when sending and
 * {@link decodeEnvelope} when displaying. Plain-text peers are supported via
 * automatic fallback.
 *
 * See `docs/MESSAGE-ENVELOPE.md` for the full wire-level specification.
 */

export interface EncryptedAttachment {
  /** Discriminator. v1 defines `encrypted_blob` only; unknown types MUST be ignored. */
  type: 'encrypted_blob'
  /** MIME type of the *plaintext* (post-decrypt). */
  mime: string
  /** Optional UI hint — not authoritative. */
  name?: string
  /** Plaintext size in bytes. */
  size: number
  /** Hex sha256 of the plaintext. Recipients verify post-decrypt. */
  sha256: string
  /** Encryption algorithm. v1 = AES-256-GCM only. */
  cipher: 'aes-256-gcm'
  /** Base64 of raw 32-byte AES key. */
  key: string
  /** Base64 of 12-byte AES-GCM IV. */
  iv: string
  /** Storage layer descriptor — Blossom (BUD-01) for v1. */
  blossom: {
    /** Hex sha256 of the *ciphertext*. Used as Blossom blob id. */
    blob_sha256: string
    /** Mirror hints; clients try in order. */
    servers: string[]
  }
}

export interface MessageEnvelope {
  v: 1
  text: string
  attachments: EncryptedAttachment[]
}

export function encodeEnvelope(env: MessageEnvelope): string {
  return JSON.stringify(env)
}

/**
 * Decode a body string into a v1 envelope.
 *
 * Behaviour matrix:
 * - Empty / falsy input → empty envelope.
 * - Not JSON, or no `v` field → treat the whole input as plain text.
 * - `v === 1` → parse text + validated attachments.
 * - `v > 1` → forward-compat: extract `text` only, drop attachments
 *   (v1 parsers can't safely interpret a future attachment schema).
 */
export function decodeEnvelope(body: string): MessageEnvelope {
  if (!body) return { v: 1, text: '', attachments: [] }
  try {
    const parsed = JSON.parse(body) as unknown
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      if (typeof obj.v === 'number') {
        const text = typeof obj.text === 'string' ? obj.text : ''
        const attachments =
          obj.v === 1 && Array.isArray(obj.attachments)
            ? (obj.attachments as unknown[]).filter(isValidAttachment)
            : []
        return { v: 1, text, attachments }
      }
    }
  } catch {
    /* not JSON */
  }
  return { v: 1, text: body, attachments: [] }
}

function isValidAttachment(a: unknown): a is EncryptedAttachment {
  if (!a || typeof a !== 'object') return false
  const x = a as Partial<EncryptedAttachment>
  return (
    x.type === 'encrypted_blob' &&
    typeof x.mime === 'string' &&
    typeof x.size === 'number' &&
    typeof x.sha256 === 'string' &&
    x.cipher === 'aes-256-gcm' &&
    typeof x.key === 'string' &&
    typeof x.iv === 'string' &&
    !!x.blossom &&
    typeof x.blossom.blob_sha256 === 'string' &&
    Array.isArray(x.blossom.servers)
  )
}
