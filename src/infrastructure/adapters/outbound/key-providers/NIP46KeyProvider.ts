import NDK, { NDKNip46Signer, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import type { KeyProvider } from '../../../../application/ports/outbound/KeyProvider.js'

export class NIP46KeyProvider implements KeyProvider {
  private readonly signer: NDKNip46Signer

  constructor(
    ndk: NDK,
    connectionToken: string,
    localSigner?: NDKPrivateKeySigner,
  ) {
    const local = localSigner ?? NDKPrivateKeySigner.generate()
    this.signer = new NDKNip46Signer(ndk, connectionToken, local)
  }

  async getPubkey(): Promise<string> {
    return (await this.signer.user()).pubkey
  }

  getNDKSigner(): NDKNip46Signer {
    return this.signer
  }
}
