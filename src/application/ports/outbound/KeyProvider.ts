import type { SignedEvent, UnsignedEvent } from './NostrEventPort.js'

export interface KeyProvider {
  getPubkey(): Promise<string>
  sign(event: UnsignedEvent): Promise<SignedEvent>
  encrypt(plaintext: string, recipientPubkey: string): Promise<string>
  decrypt(ciphertext: string, senderPubkey: string): Promise<string>
}
