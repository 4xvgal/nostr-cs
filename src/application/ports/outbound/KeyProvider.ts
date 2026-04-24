import type { NDKSigner } from '@nostr-dev-kit/ndk'
import type { SignedEvent, UnsignedEvent } from './NostrEventPort.js'

export interface KeyProvider {
  getPubkey(): Promise<string>

  getNDKSigner(): NDKSigner

  signAndPublish?(rawEvent: UnsignedEvent, targetRelays?: string[]): Promise<SignedEvent>
}
