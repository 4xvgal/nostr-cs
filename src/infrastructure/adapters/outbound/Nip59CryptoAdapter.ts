import { finalizeEvent, generateSecretKey, getEventHash, getPublicKey } from 'nostr-tools/pure'
import { v2 as nip44v2 } from 'nostr-tools/nip44'
import type {
  CryptoPort,
  Nip17Rumor,
  Nip17Unsealed,
} from '../../../application/ports/outbound/CryptoPort.js'
import type {
  SignedEvent,
  UnsignedEvent,
} from '../../../application/ports/outbound/NostrEventPort.js'
import type { KeyProvider } from '../../../application/ports/outbound/KeyProvider.js'

function randomPastTimestamp(): number {
  const now = Math.floor(Date.now() / 1000)
  const twoDays = 2 * 24 * 60 * 60
  return now - Math.floor(Math.random() * twoDays)
}

export class Nip59CryptoAdapter implements CryptoPort {
  constructor(private readonly keyProvider: KeyProvider) {}

  encrypt(plaintext: string, recipientPubkey: string): Promise<string> {
    return this.keyProvider.encrypt(plaintext, recipientPubkey)
  }

  decrypt(ciphertext: string, senderPubkey: string): Promise<string> {
    return this.keyProvider.decrypt(ciphertext, senderPubkey)
  }

  async sealAndWrap(rumor: Nip17Rumor, recipientPubkey: string): Promise<SignedEvent> {
    const senderPk = await this.keyProvider.getPubkey()

    const rumorWithPubkey = {
      kind: rumor.kind,
      tags: rumor.tags,
      content: rumor.content,
      created_at: rumor.created_at,
      pubkey: senderPk,
    }
    const rumorId = getEventHash(rumorWithPubkey)
    const rumorForJson = { ...rumorWithPubkey, id: rumorId }

    const sealContent = await this.keyProvider.encrypt(
      JSON.stringify(rumorForJson),
      recipientPubkey,
    )
    const sealUnsigned: UnsignedEvent = {
      kind: 13,
      tags: [],
      content: sealContent,
      created_at: randomPastTimestamp(),
    }
    const seal = await this.keyProvider.sign(sealUnsigned)

    const ephemeralSk = generateSecretKey()
    const ephemeralPk = getPublicKey(ephemeralSk)
    const convKey = nip44v2.utils.getConversationKey(ephemeralSk, recipientPubkey)
    const wrapContent = nip44v2.encrypt(JSON.stringify(seal), convKey)

    const wrap = finalizeEvent(
      {
        kind: 1059,
        tags: [['p', recipientPubkey]],
        content: wrapContent,
        created_at: randomPastTimestamp(),
      },
      ephemeralSk,
    )
    void ephemeralPk

    return {
      id: wrap.id,
      pubkey: wrap.pubkey,
      kind: wrap.kind,
      tags: wrap.tags,
      content: wrap.content,
      created_at: wrap.created_at,
      sig: wrap.sig,
    }
  }

  async unwrapAndUnseal(giftWrap: SignedEvent): Promise<Nip17Unsealed> {
    const sealJson = await this.keyProvider.decrypt(giftWrap.content, giftWrap.pubkey)
    const seal = JSON.parse(sealJson) as SignedEvent
    const rumorJson = await this.keyProvider.decrypt(seal.content, seal.pubkey)
    const rumor = JSON.parse(rumorJson) as {
      kind: number
      tags: string[][]
      content: string
      created_at: number
      pubkey: string
    }

    return {
      kind: 14,
      pubkey: rumor.pubkey,
      tags: rumor.tags,
      content: rumor.content,
      created_at: rumor.created_at,
    }
  }
}
