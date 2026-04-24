import type { RelaySet } from '../../../domain/value-objects/RelaySet.js'
import type { NostrProfile } from '../../../domain/entities/NostrProfile.js'

export interface ProfilePort {
  fetchRelaySet(pubkey: string): Promise<RelaySet>
  publishRelaySet(relaySet: RelaySet, targetRelays: string[]): Promise<void>

  fetchDMRelays(pubkey: string): Promise<string[]>
  publishDMRelays(dmRelays: string[], targetRelays: string[]): Promise<void>

  fetchProfile(pubkey: string, hintRelays?: string[]): Promise<NostrProfile>
  publishProfile(profile: NostrProfile, targetRelays: string[]): Promise<void>
}
