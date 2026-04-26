import type { SimplePool } from 'nostr-tools/pool'
import type { Event as NtEvent } from 'nostr-tools/core'
import type { Filter } from 'nostr-tools/filter'
import type {
  NostrEventPort,
  SignedEvent,
  Subscription,
  SubscriptionFilter,
  UnsignedEvent,
} from '../../../application/ports/outbound/NostrEventPort.js'
import type { KeyProvider } from '../../../application/ports/outbound/KeyProvider.js'

export class SimplePoolRelayAdapter implements NostrEventPort {
  constructor(
    private readonly pool: SimplePool,
    private readonly keyProvider: KeyProvider,
    private readonly defaultRelays: string[],
  ) {}

  async publish(
    event: UnsignedEvent | SignedEvent,
    targetRelays?: string[],
  ): Promise<SignedEvent> {
    const signed: SignedEvent =
      'sig' in event && event.sig
        ? (event as SignedEvent)
        : await this.keyProvider.sign(event)

    const relays = targetRelays && targetRelays.length > 0 ? targetRelays : this.defaultRelays
    const results = this.pool.publish(relays, signed as NtEvent)
    try {
      await Promise.any(results)
    } catch {
      /* every relay rejected — swallow; caller observes delivery via subscriptions */
    }
    return signed
  }

  subscribe(
    filter: SubscriptionFilter,
    onEvent: (event: SignedEvent) => void,
    opts?: { relays?: string[] },
  ): Subscription {
    const relays =
      opts?.relays && opts.relays.length > 0 ? opts.relays : this.defaultRelays
    const sub = this.pool.subscribeMany(relays, filter as Filter, {
      onevent: (ev) => {
        onEvent({
          id: ev.id,
          pubkey: ev.pubkey,
          kind: ev.kind,
          tags: ev.tags,
          content: ev.content,
          created_at: ev.created_at,
          sig: ev.sig,
        })
      },
    })
    return { close: () => sub.close() }
  }
}
