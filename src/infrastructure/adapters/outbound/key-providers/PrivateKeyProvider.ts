import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import { v2 as nip44v2 } from 'nostr-tools/nip44'
import { decode as decodeBech32 } from 'nostr-tools/nip19'
import type { KeyProvider } from '../../../../application/ports/outbound/KeyProvider.js'
import type {
  SignedEvent,
  UnsignedEvent,
} from '../../../../application/ports/outbound/NostrEventPort.js'

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('hex string has odd length')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) throw new Error(`invalid hex at offset ${i * 2}`)
    out[i] = byte
  }
  return out
}

function resolveSecretKey(input: { type: 'nsec' | 'hex'; value: string }): Uint8Array {
  if (input.type === 'nsec') {
    const decoded = decodeBech32(input.value)
    if (decoded.type !== 'nsec') throw new Error(`not an nsec: ${input.value.slice(0, 10)}…`)
    return decoded.data as Uint8Array
  }
  return hexToBytes(input.value)
}

export class PrivateKeyProvider implements KeyProvider {
  private readonly sk: Uint8Array
  private readonly pk: string

  constructor(input: { type: 'nsec' | 'hex'; value: string }) {
    this.sk = resolveSecretKey(input)
    this.pk = getPublicKey(this.sk)
  }

  async getPubkey(): Promise<string> {
    return this.pk
  }

  async sign(event: UnsignedEvent): Promise<SignedEvent> {
    const signed = finalizeEvent(event, this.sk)
    return {
      id: signed.id,
      pubkey: signed.pubkey,
      kind: signed.kind,
      tags: signed.tags,
      content: signed.content,
      created_at: signed.created_at,
      sig: signed.sig,
    }
  }

  async encrypt(plaintext: string, recipientPubkey: string): Promise<string> {
    const key = nip44v2.utils.getConversationKey(this.sk, recipientPubkey)
    return nip44v2.encrypt(plaintext, key)
  }

  async decrypt(ciphertext: string, senderPubkey: string): Promise<string> {
    const key = nip44v2.utils.getConversationKey(this.sk, senderPubkey)
    return nip44v2.decrypt(ciphertext, key)
  }
}
