import { BunkerSigner, parseBunkerInput, type BunkerPointer } from 'nostr-tools/nip46'
import type { SimplePool } from 'nostr-tools/pool'
import type {
  SignedEvent,
  UnsignedEvent,
} from '../../../../application/ports/outbound/NostrEventPort.js'
import type { KeyProvider } from '../../../../application/ports/outbound/KeyProvider.js'

export class NIP46KeyProvider implements KeyProvider {
  private signer: BunkerSigner | null = null
  private readyPromise: Promise<void>

  constructor(
    private readonly pool: SimplePool,
    private readonly clientSecretKey: Uint8Array,
    private readonly bunkerInput: string,
  ) {
    this.readyPromise = this.init()
  }

  private async init(): Promise<void> {
    const pointer: BunkerPointer | null = await parseBunkerInput(this.bunkerInput)
    if (!pointer) throw new Error(`invalid bunker input: ${this.bunkerInput.slice(0, 40)}…`)
    this.signer = BunkerSigner.fromBunker(this.clientSecretKey, pointer, { pool: this.pool })
    await this.signer.connect()
  }

  private async ready(): Promise<BunkerSigner> {
    await this.readyPromise
    if (!this.signer) throw new Error('NIP-46 signer not initialised')
    return this.signer
  }

  async getPubkey(): Promise<string> {
    const s = await this.ready()
    return s.getPublicKey()
  }

  async sign(event: UnsignedEvent): Promise<SignedEvent> {
    const s = await this.ready()
    const signed = await s.signEvent(event)
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
    const s = await this.ready()
    return s.nip44Encrypt(recipientPubkey, plaintext)
  }

  async decrypt(ciphertext: string, senderPubkey: string): Promise<string> {
    const s = await this.ready()
    return s.nip44Decrypt(senderPubkey, ciphertext)
  }

  async close(): Promise<void> {
    if (this.signer) await this.signer.close()
  }
}
