import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import type { KeyProvider } from '../../../../application/ports/outbound/KeyProvider.js'

export class PrivateKeyProvider implements KeyProvider {
  private readonly signer: NDKPrivateKeySigner

  constructor(input: { type: 'nsec'; value: string } | { type: 'hex'; value: string }) {
    this.signer = new NDKPrivateKeySigner(input.value)
  }

  async getPubkey(): Promise<string> {
    return (await this.signer.user()).pubkey
  }

  getNDKSigner(): NDKPrivateKeySigner {
    return this.signer
  }
}
