import type { ProfilePort } from '../../application/ports/outbound/ProfilePort.js'
import { RelaySet } from '../value-objects/RelaySet.js'
import type { NostrProfile } from '../entities/NostrProfile.js'

export class RelayDiscoveryService {
  constructor(
    private readonly profilePort: ProfilePort,
    private readonly bootstrapRelays: string[],
  ) {}

  async resolveProfile(pubkey: string): Promise<NostrProfile> {
    const relaySet = await this.resolveRelays(pubkey)
    return this.profilePort.fetchProfile(pubkey, relaySet.write)
  }

  async resolveRelays(pubkey: string): Promise<RelaySet> {
    try {
      return await this.profilePort.fetchRelaySet(pubkey)
    } catch {
      return new RelaySet(this.bootstrapRelays, this.bootstrapRelays)
    }
  }

  async getPublishRelays(recipientPubkey: string): Promise<string[]> {
    const rs = await this.resolveRelays(recipientPubkey)
    return rs.read.length > 0 ? rs.read : this.bootstrapRelays
  }

  async getDMRelays(recipientPubkey: string): Promise<string[]> {
    try {
      const dm = await this.profilePort.fetchDMRelays(recipientPubkey)
      if (dm.length > 0) return dm
    } catch {
      /* fall through */
    }
    return this.getPublishRelays(recipientPubkey)
  }
}
