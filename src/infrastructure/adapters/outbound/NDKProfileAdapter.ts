import NDK, { NDKEvent, NDKRelaySet, getRelayListForUser } from '@nostr-dev-kit/ndk'
import type { ProfilePort } from '../../../application/ports/outbound/ProfilePort.js'
import type { KeyProvider } from '../../../application/ports/outbound/KeyProvider.js'
import { RelaySet } from '../../../domain/value-objects/RelaySet.js'
import { NostrProfile } from '../../../domain/entities/NostrProfile.js'

export class NDKProfileAdapter implements ProfilePort {
  constructor(
    private readonly ndk: NDK,
    private readonly keyProvider: KeyProvider,
  ) {}

  async fetchRelaySet(pubkey: string): Promise<RelaySet> {
    const relayList = await getRelayListForUser(pubkey, this.ndk)
    if (!relayList) throw new Error('NIP-65 not found')
    return new RelaySet(
      [...relayList.writeRelayUrls],
      [...relayList.readRelayUrls],
    )
  }

  async publishRelaySet(relaySet: RelaySet, targetRelays: string[]): Promise<void> {
    const event = new NDKEvent(this.ndk, {
      kind: 10002,
      tags: relaySet.toNIP65Tags(),
      content: '',
      created_at: Math.floor(Date.now() / 1000),
    } as never)
    await event.sign(this.keyProvider.getNDKSigner())
    await event.publish(NDKRelaySet.fromRelayUrls(targetRelays, this.ndk))
  }

  async fetchDMRelays(pubkey: string): Promise<string[]> {
    const events = await this.ndk.fetchEvents({ kinds: [10050], authors: [pubkey], limit: 1 })
    const event = [...events][0]
    if (!event) throw new Error('kind 10050 not found')
    return event.tags
      .filter((t) => t[0] === 'relay' && typeof t[1] === 'string')
      .map((t) => t[1] as string)
  }

  async publishDMRelays(dmRelays: string[], targetRelays: string[]): Promise<void> {
    const event = new NDKEvent(this.ndk, {
      kind: 10050,
      tags: dmRelays.map((url) => ['relay', url]),
      content: '',
      created_at: Math.floor(Date.now() / 1000),
    } as never)
    await event.sign(this.keyProvider.getNDKSigner())
    await event.publish(NDKRelaySet.fromRelayUrls(targetRelays, this.ndk))
  }

  async fetchProfile(pubkey: string, hintRelays?: string[]): Promise<NostrProfile> {
    const user = this.ndk.getUser({ pubkey })
    await user.fetchProfile()
    const p = user.profile as
      | ((typeof user.profile) & { cs_role?: 'agent' | 'customer' })
      | undefined
    const relays = await this.fetchRelaySet(pubkey).catch(
      () => new RelaySet(hintRelays ?? [], hintRelays ?? []),
    )
    return new NostrProfile(
      pubkey,
      p?.name ?? '',
      p?.about ?? '',
      p?.image ?? '',
      p?.cs_role,
      relays,
    )
  }

  async publishProfile(profile: NostrProfile, targetRelays: string[]): Promise<void> {
    const event = new NDKEvent(this.ndk, {
      kind: 0,
      tags: [],
      content: JSON.stringify({
        name: profile.name,
        about: profile.about,
        picture: profile.picture,
        cs_role: profile.csRole,
      }),
      created_at: Math.floor(Date.now() / 1000),
    } as never)
    await event.sign(this.keyProvider.getNDKSigner())
    await event.publish(NDKRelaySet.fromRelayUrls(targetRelays, this.ndk))
  }
}
