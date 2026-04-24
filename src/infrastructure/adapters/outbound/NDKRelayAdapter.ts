import NDK, { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk'
import type { NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk'
import type {
  NostrEventPort,
  SignedEvent,
  Subscription,
  SubscriptionFilter,
  UnsignedEvent,
} from '../../../application/ports/outbound/NostrEventPort.js'
import type { KeyProvider } from '../../../application/ports/outbound/KeyProvider.js'

export class NDKRelayAdapter implements NostrEventPort {
  constructor(
    private readonly ndk: NDK,
    private readonly keyProvider: KeyProvider,
  ) {}

  async publish(event: UnsignedEvent | SignedEvent, targetRelays?: string[]): Promise<SignedEvent> {
    const ndkEvent = new NDKEvent(this.ndk, event as never)

    if (!('sig' in event && event.sig)) {
      await ndkEvent.sign(this.keyProvider.getNDKSigner())
    }

    const relaySet = targetRelays && targetRelays.length > 0
      ? NDKRelaySet.fromRelayUrls(targetRelays, this.ndk)
      : undefined

    await ndkEvent.publish(relaySet)

    return {
      id: ndkEvent.id,
      pubkey: ndkEvent.pubkey,
      kind: ndkEvent.kind!,
      tags: ndkEvent.tags,
      content: ndkEvent.content,
      created_at: ndkEvent.created_at!,
      sig: ndkEvent.sig!,
    }
  }

  subscribe(
    filter: SubscriptionFilter,
    onEvent: (event: SignedEvent) => void,
    opts?: { relays?: string[] },
  ): Subscription {
    const relaySet = opts?.relays && opts.relays.length > 0
      ? NDKRelaySet.fromRelayUrls(opts.relays, this.ndk)
      : undefined

    const sub: NDKSubscription = this.ndk.subscribe(
      filter as NDKFilter,
      { closeOnEose: false },
      relaySet,
    )

    sub.on('event', (ev) => {
      onEvent({
        id: ev.id,
        pubkey: ev.pubkey,
        kind: ev.kind!,
        tags: ev.tags,
        content: ev.content,
        created_at: ev.created_at!,
        sig: ev.sig ?? '',
      })
    })

    return {
      close: () => sub.stop(),
    }
  }
}
