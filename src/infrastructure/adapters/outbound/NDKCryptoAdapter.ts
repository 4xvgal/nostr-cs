import NDK, { NDKEvent, giftUnwrap, giftWrap } from '@nostr-dev-kit/ndk'
import type {
  CryptoPort,
  Nip17Rumor,
  Nip17Unsealed,
} from '../../../application/ports/outbound/CryptoPort.js'
import type { SignedEvent } from '../../../application/ports/outbound/NostrEventPort.js'
import type { KeyProvider } from '../../../application/ports/outbound/KeyProvider.js'

export class NDKCryptoAdapter implements CryptoPort {
  constructor(
    private readonly ndk: NDK,
    private readonly keyProvider: KeyProvider,
  ) {}

  async encrypt(plaintext: string, recipientPubkey: string): Promise<string> {
    const signer = this.keyProvider.getNDKSigner()
    return signer.encrypt(this.ndk.getUser({ pubkey: recipientPubkey }), plaintext, 'nip44')
  }

  async decrypt(ciphertext: string, senderPubkey: string): Promise<string> {
    const signer = this.keyProvider.getNDKSigner()
    return signer.decrypt(this.ndk.getUser({ pubkey: senderPubkey }), ciphertext, 'nip44')
  }

  async sealAndWrap(rumor: Nip17Rumor, recipientPubkey: string): Promise<SignedEvent> {
    const signer = this.keyProvider.getNDKSigner()
    const selfPubkey = (await signer.user()).pubkey

    const rumorEvent = new NDKEvent(this.ndk, {
      kind: rumor.kind,
      tags: rumor.tags,
      content: rumor.content,
      created_at: rumor.created_at,
      pubkey: selfPubkey,
    } as never)

    const recipient = this.ndk.getUser({ pubkey: recipientPubkey })
    const wrap = await giftWrap(rumorEvent, recipient, signer)

    return {
      id: wrap.id,
      pubkey: wrap.pubkey,
      kind: wrap.kind!,
      tags: wrap.tags,
      content: wrap.content,
      created_at: wrap.created_at!,
      sig: wrap.sig!,
    }
  }

  async unwrapAndUnseal(giftWrapEvt: SignedEvent): Promise<Nip17Unsealed> {
    const signer = this.keyProvider.getNDKSigner()
    const wrap = new NDKEvent(this.ndk, giftWrapEvt as never)
    const rumor = await giftUnwrap(wrap, await signer.user(), signer)

    return {
      kind: 14,
      pubkey: rumor.pubkey,
      tags: rumor.tags,
      content: rumor.content,
      created_at: rumor.created_at!,
    }
  }
}
