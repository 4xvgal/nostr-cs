import type {
  NostrEventPort,
  SignedEvent,
  Subscription,
  UnsignedEvent,
} from '../../ports/outbound/NostrEventPort.js'
import type { CryptoPort } from '../../ports/outbound/CryptoPort.js'
import type { KeyProvider } from '../../ports/outbound/KeyProvider.js'
import type { ResolvedRelayConfig } from '../../config/ResolvedRelayConfig.js'

/**
 * NIP-78 application data (kind 30078).
 *
 * Each (author, d-tag) is a parameterized-replaceable slot — only the latest
 * event is retained by relays. Content is NIP-44-encrypted to the author
 * themselves, so relays only ever see ciphertext.
 *
 * Use cases:
 *   - per-app private state (ephemeral key rings, drafts, prefs) that needs
 *     cross-device sync without a central server.
 */
export class AppDataUseCase {
  constructor(
    private readonly nostrEvent: NostrEventPort,
    private readonly crypto: CryptoPort,
    private readonly keyProvider: KeyProvider,
    private readonly relayConfig: ResolvedRelayConfig,
  ) {}

  async save(dTag: string, plaintext: string): Promise<void> {
    const me = await this.keyProvider.getPubkey()
    const ciphertext = await this.crypto.encrypt(plaintext, me)
    const raw: UnsignedEvent = {
      kind: 30078,
      tags: [['d', dTag]],
      content: ciphertext,
      created_at: Math.floor(Date.now() / 1000),
    }
    await this.nostrEvent.publish(raw, this.relayConfig.write)
  }

  /** Returns the latest plaintext for this slot, or null if none / decryption fails / timeout. */
  async load(dTag: string, windowMs = 3000): Promise<string | null> {
    const me = await this.keyProvider.getPubkey()
    return new Promise<string | null>((resolve) => {
      let latest: SignedEvent | null = null
      let sub: Subscription | null = null
      const finish = (): void => {
        if (sub) sub.close()
        if (!latest) return resolve(null)
        this.crypto
          .decrypt(latest.content, me)
          .then((plain) => resolve(plain))
          .catch(() => resolve(null))
      }
      sub = this.nostrEvent.subscribe(
        { kinds: [30078], authors: [me], '#d': [dTag] },
        (ev) => {
          if (!latest || ev.created_at > latest.created_at) latest = ev
        },
        { relays: this.relayConfig.read },
      )
      setTimeout(finish, windowMs)
    })
  }
}
