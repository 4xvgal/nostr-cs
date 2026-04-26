import type { SimplePool } from 'nostr-tools/pool'
import type { Event as NtEvent } from 'nostr-tools/core'
import type { ProfilePort } from '../../../application/ports/outbound/ProfilePort.js'
import type { KeyProvider } from '../../../application/ports/outbound/KeyProvider.js'
import { RelaySet } from '../../../domain/value-objects/RelaySet.js'
import { NostrProfile } from '../../../domain/entities/NostrProfile.js'
import { publishToAtLeastOneRelay } from './publishToAtLeastOneRelay.js'

export class SimplePoolProfileAdapter implements ProfilePort {
  constructor(
    private readonly pool: SimplePool,
    private readonly keyProvider: KeyProvider,
    private readonly queryRelays: string[],
  ) {}

  async fetchRelaySet(pubkey: string): Promise<RelaySet> {
    const events = await this.pool.querySync(this.queryRelays, {
      kinds: [10002],
      authors: [pubkey],
      limit: 1,
    })
    const ev = events[0]
    if (!ev) throw new Error('NIP-65 not found')
    return RelaySet.fromNIP65Tags(ev.tags)
  }

  async publishRelaySet(relaySet: RelaySet, targetRelays: string[]): Promise<void> {
    const signed = await this.keyProvider.sign({
      kind: 10002,
      tags: relaySet.toNIP65Tags(),
      content: '',
      created_at: Math.floor(Date.now() / 1000),
    })
    await publishToAtLeastOneRelay(this.pool, targetRelays, signed as NtEvent)
  }

  async fetchDMRelays(pubkey: string): Promise<string[]> {
    const events = await this.pool.querySync(this.queryRelays, {
      kinds: [10050],
      authors: [pubkey],
      limit: 1,
    })
    const ev = events[0]
    if (!ev) throw new Error('kind 10050 not found')
    return ev.tags
      .filter((t) => t[0] === 'relay' && typeof t[1] === 'string')
      .map((t) => t[1] as string)
  }

  async publishDMRelays(dmRelays: string[], targetRelays: string[]): Promise<void> {
    const signed = await this.keyProvider.sign({
      kind: 10050,
      tags: dmRelays.map((url) => ['relay', url]),
      content: '',
      created_at: Math.floor(Date.now() / 1000),
    })
    await publishToAtLeastOneRelay(this.pool, targetRelays, signed as NtEvent)
  }

  async fetchProfile(pubkey: string, hintRelays?: string[]): Promise<NostrProfile> {
    const events = await this.pool.querySync(this.queryRelays, {
      kinds: [0],
      authors: [pubkey],
      limit: 1,
    })
    const ev = events[0]
    let parsed: { name?: string; about?: string; picture?: string; cs_role?: 'agent' | 'customer' } = {}
    if (ev) {
      try {
        parsed = JSON.parse(ev.content)
      } catch {
        /* malformed profile content — return empty */
      }
    }
    const relays = await this.fetchRelaySet(pubkey).catch(
      () => new RelaySet(hintRelays ?? [], hintRelays ?? []),
    )
    return new NostrProfile(
      pubkey,
      parsed.name ?? '',
      parsed.about ?? '',
      parsed.picture ?? '',
      parsed.cs_role,
      relays,
    )
  }

  async publishProfile(profile: NostrProfile, targetRelays: string[]): Promise<void> {
    const signed = await this.keyProvider.sign({
      kind: 0,
      tags: [],
      content: JSON.stringify({
        name: profile.name,
        about: profile.about,
        picture: profile.picture,
        cs_role: profile.csRole,
      }),
      created_at: Math.floor(Date.now() / 1000),
    })
    await publishToAtLeastOneRelay(this.pool, targetRelays, signed as NtEvent)
  }
}
