import { NDKNip07Signer } from '@nostr-dev-kit/ndk'
import type { KeyProvider } from '../../../../application/ports/outbound/KeyProvider.js'

export class NIP07KeyProvider implements KeyProvider {
  private readonly signer = new NDKNip07Signer()

  async getPubkey(): Promise<string> {
    return (await this.signer.user()).pubkey
  }

  getNDKSigner(): NDKNip07Signer {
    return this.signer
  }
}
