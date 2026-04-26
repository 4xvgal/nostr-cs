import type {
  SignedEvent,
  UnsignedEvent,
} from '../../../../application/ports/outbound/NostrEventPort.js'
import type { KeyProvider } from '../../../../application/ports/outbound/KeyProvider.js'

interface Nip07 {
  getPublicKey(): Promise<string>
  signEvent(event: UnsignedEvent): Promise<SignedEvent>
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>
    decrypt(pubkey: string, ciphertext: string): Promise<string>
  }
}

function getWindowNostr(): Nip07 {
  const w = globalThis as unknown as { nostr?: Nip07 }
  if (!w.nostr) throw new Error('window.nostr is not available (no NIP-07 extension)')
  return w.nostr
}

export class NIP07KeyProvider implements KeyProvider {
  async getPubkey(): Promise<string> {
    return getWindowNostr().getPublicKey()
  }

  async sign(event: UnsignedEvent): Promise<SignedEvent> {
    return getWindowNostr().signEvent(event)
  }

  async encrypt(plaintext: string, recipientPubkey: string): Promise<string> {
    const n = getWindowNostr()
    if (!n.nip44) throw new Error('window.nostr.nip44 not supported by this extension')
    return n.nip44.encrypt(recipientPubkey, plaintext)
  }

  async decrypt(ciphertext: string, senderPubkey: string): Promise<string> {
    const n = getWindowNostr()
    if (!n.nip44) throw new Error('window.nostr.nip44 not supported by this extension')
    return n.nip44.decrypt(senderPubkey, ciphertext)
  }
}
