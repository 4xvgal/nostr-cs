import type { ProfilePort } from '../../ports/outbound/ProfilePort.js'
import type { RelayIndexPort } from '../../ports/outbound/RelayIndexPort.js'
import type { KeyProvider } from '../../ports/outbound/KeyProvider.js'
import type { ResolvedRelayConfig } from '../../config/ResolvedRelayConfig.js'
import { NostrProfile } from '../../../domain/entities/NostrProfile.js'
import { RelaySet } from '../../../domain/value-objects/RelaySet.js'

export class BootstrapUseCase {
  constructor(
    private readonly profilePort: ProfilePort,
    private readonly relayIndex: RelayIndexPort,
    private readonly keyProvider: KeyProvider,
    private readonly relayConfig: ResolvedRelayConfig,
    private readonly profileMeta?: { name: string; csRole: 'agent' | 'customer' },
  ) {}

  async execute(): Promise<void> {
    const pubkey = await this.keyProvider.getPubkey()

    const publicRelays = await this.relayIndex
      .fetchPublicRelays({ noPayment: true, noAuth: true, limit: 10 })
      .catch(() => [] as string[])

    const spreadRelays = [
      ...new Set([...this.relayConfig.bootstrap, ...publicRelays]),
    ]

    const relaySet = new RelaySet(this.relayConfig.write, this.relayConfig.read)
    await this.profilePort.publishRelaySet(relaySet, spreadRelays)

    if (this.relayConfig.dm.length > 0) {
      await this.profilePort.publishDMRelays(this.relayConfig.dm, spreadRelays)
    }

    if (this.profileMeta) {
      const profile = new NostrProfile(
        pubkey,
        this.profileMeta.name,
        '',
        '',
        this.profileMeta.csRole,
        relaySet,
      )
      await this.profilePort.publishProfile(profile, spreadRelays)
    }
  }
}
