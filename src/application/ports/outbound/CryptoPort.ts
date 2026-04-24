import type { SignedEvent } from './NostrEventPort.js'

export interface Nip17Rumor {
  kind: 14
  tags: string[][]
  content: string
  created_at: number
}

export interface Nip17Unsealed extends Nip17Rumor {
  pubkey: string
}

export interface CryptoPort {
  encrypt(plaintext: string, recipientPubkey: string): Promise<string>
  decrypt(ciphertext: string, senderPubkey: string): Promise<string>

  sealAndWrap(rumor: Nip17Rumor, recipientPubkey: string): Promise<SignedEvent>
  unwrapAndUnseal(giftWrap: SignedEvent): Promise<Nip17Unsealed>
}
