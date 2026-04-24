import type { RelaySet } from '../value-objects/RelaySet.js'

export class NostrProfile {
  constructor(
    readonly pubkey: string,
    readonly name: string,
    readonly about: string,
    readonly picture: string,
    readonly csRole: 'agent' | 'customer' | undefined,
    readonly relaySet: RelaySet,
  ) {}
}
